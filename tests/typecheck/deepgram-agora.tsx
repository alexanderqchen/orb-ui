import { AgentMicrophone, AgentPlayer, AgentSession } from '@deepgram/agents'
import { createDeepgramAdapter, type DeepgramResources } from '../../src/adapters/deepgram'

const createResources = (): DeepgramResources => {
  const session = new AgentSession({
    auth: { tokenFactory: async () => 'short-lived-token-from-your-backend' },
    agent: 'your-agent-id',
  })
  const microphone = new AgentMicrophone((chunk) => session.sendAudio(chunk))
  return { session, microphone, player: new AgentPlayer() }
}
createDeepgramAdapter({ createResources })

import { AgoraVoiceAI } from 'agora-agent-client-toolkit'
import type { IAgoraRTCClient, ILocalAudioTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng'
import { createAgoraAdapter, type AgoraSession } from '../../src/adapters/agora'

declare const toolkit: AgoraVoiceAI
declare const rtc: IAgoraRTCClient
declare const microphone: ILocalAudioTrack
declare const agentAudio: IRemoteAudioTrack
const agoraSession: AgoraSession = {
  toolkit,
  rtc,
  agentUserId: 'agent-uid-from-backend',
  getMicrophoneTrack: () => microphone,
  getAgentAudioTrack: () => agentAudio,
  close: async () => {
    microphone.close()
    agentAudio.stop()
    toolkit.unsubscribe()
    toolkit.destroy()
    await rtc.leave()
  },
}
createAgoraAdapter({ createSession: async () => agoraSession })

// The complete published Agora component is compiled against the real SDKs.
import { useEffect, useMemo, useRef, useState } from 'react'

import AgoraRTC, { type IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'
import AgoraRTM, { type RTMClient } from 'agora-rtm'
import { TranscriptHelperMode } from 'agora-agent-client-toolkit'
import { Orb } from '../../src'

type SessionGrant = {
  id: string
  appId: string
  channel: string
  uid: string
  agentUserId: string
  rtcToken: string
  rtmToken: string
}

async function jsonRequest<T>(url: string, signal: AbortSignal, method = 'POST'): Promise<T> {
  const response = await fetch(url, {
    method,
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Your application could not authorize the Agora session.')
  return response.json()
}

async function createSession(signal: AbortSignal): Promise<AgoraSession> {
  const rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
  let microphone: ILocalAudioTrack | undefined
  let remoteAudio: IRemoteAudioTrack | undefined
  let rtm: RTMClient | undefined
  let toolkit: AgoraVoiceAI | undefined
  let grant: SessionGrant | undefined
  let closed = false
  let playbackError: unknown
  let closing: Promise<void> | undefined

  const check = () => {
    if (closed || signal.aborted) throw new DOMException('Session cancelled.', 'AbortError')
  }
  const renew = async () => {
    try {
      check()
      const tokens = await jsonRequest<{ rtcToken: string; rtmToken: string }>(
        `/api/agora/sessions/${grant!.id}/tokens`,
        signal,
      )
      check()
      await Promise.all([rtc.renewToken(tokens.rtcToken), rtm!.renewToken(tokens.rtmToken)])
    } catch (error) {
      playbackError = error
    }
  }
  const published = async (
    user: IAgoraRTCRemoteUser,
    mediaType: 'audio' | 'video' | 'datachannel',
  ) => {
    if (mediaType !== 'audio' || String(user.uid) !== grant?.agentUserId) return
    try {
      await rtc.subscribe(user, 'audio')
      check()
      remoteAudio = user.audioTrack
      remoteAudio?.play()
    } catch (error) {
      user.audioTrack?.stop()
      if (!closed && !signal.aborted) playbackError = error
    }
  }
  const unpublished = (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
    if (mediaType === 'audio' && String(user.uid) === grant?.agentUserId) {
      remoteAudio?.stop()
      remoteAudio = undefined
    }
  }
  const close = (): Promise<void> => {
    if (closing) return closing
    closed = true
    signal.removeEventListener('abort', cancelCapture)
    microphone?.close()
    remoteAudio?.stop()
    rtc.off('user-published', published)
    rtc.off('user-unpublished', unpublished)
    rtc.off('token-privilege-will-expire', renew)
    rtm?.removeEventListener('tokenPrivilegeWillExpire', renew)
    toolkit?.unsubscribe()
    toolkit?.destroy()
    // No AbortSignal here: cancellation must still stop the backend agent.
    closing = Promise.allSettled([
      rtc.leave(),
      rtm?.logout(),
      grant
        ? fetch(`/api/agora/sessions/${grant.id}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            keepalive: true,
          }).then((response) => {
            if (!response.ok) throw new Error('Agent shutdown was not confirmed.')
          })
        : undefined,
    ]).then((results) => {
      const failure = results.find((result) => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    })
    return closing
  }
  const cancelCapture = () => {
    closed = true
    microphone?.close()
    remoteAudio?.stop()
  }
  signal.addEventListener('abort', cancelCapture, { once: true })

  try {
    // Start capture before any network await. Late permission results are closed.
    const capture = AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' }).then(
      (track) => {
        microphone = track
        if (closed || signal.aborted) {
          track.close()
          check()
        }
        return track
      },
    )
    const values = await Promise.all([
      jsonRequest<SessionGrant>('/api/agora/sessions', signal).then((value) => {
        grant = value
        return value
      }),
      capture,
    ])
    grant = values[0]
    check()
    rtm = new AgoraRTM.RTM(grant.appId, grant.uid)
    await rtm.login({ token: grant.rtmToken })
    check()
    toolkit = await AgoraVoiceAI.init({
      rtcEngine: rtc,
      rtmEngine: rtm,
      renderMode: TranscriptHelperMode.TEXT,
    })
    check()
    rtc.on('user-published', published)
    rtc.on('user-unpublished', unpublished)
    rtc.on('token-privilege-will-expire', renew)
    rtm.addEventListener('tokenPrivilegeWillExpire', renew)
    await rtc.join(grant.appId, grant.channel, grant.rtcToken, grant.uid)
    check()
    await rtc.publish(microphone!)
    toolkit.subscribeMessage(grant.channel)
    await jsonRequest(`/api/agora/sessions/${grant.id}/start`, signal)
    check()
    return {
      toolkit,
      rtc,
      agentUserId: grant.agentUserId,
      close,
      getMicrophoneTrack: () => microphone,
      getAgentAudioTrack: () => {
        if (playbackError) throw playbackError
        return remoteAudio
      },
    }
  } catch (error) {
    await close().catch(() => undefined)
    throw error
  }
}

export function AgoraVoice() {
  const adapter = useMemo(() => createAgoraAdapter({ createSession }), [])
  useEffect(
    () => () => {
      void adapter.stop().catch(() => undefined)
    },
    [adapter],
  )
  return <Orb adapter={adapter} theme="circle" aria-label="Start or stop your Agora assistant" />
}
import { AgentProvider, useAgentContext } from '@deepgram/react'
import { createDeepgramReactAdapter } from '../../src/adapters/deepgram'
export function DeepgramProviderTypeFixture() {
  const context = useAgentContext()
  const adapter = createDeepgramReactAdapter({
    getSnapshot: () => context,
    start: context.start,
    stop: context.stop,
  })
  return <Orb adapter={adapter} />
}

// Complete published Deepgram React component, checked against current SDK types.

export function DeepgramVoice({ agentId }: { agentId: string }) {
  const adapter = useMemo(
    () =>
      createDeepgramAdapter({
        createResources() {
          const session = new AgentSession({
            auth: {
              tokenFactory: async () => {
                const response = await fetch('/api/deepgram-token', {
                  method: 'POST',
                  credentials: 'same-origin',
                  cache: 'no-store',
                })
                if (!response.ok) throw new Error('Your application could not authorize this call.')
                const { access_token } = await response.json()
                if (typeof access_token !== 'string') throw new Error('Invalid token response.')
                return access_token
              },
            },
            agent: agentId,
            audio: {
              input: { encoding: 'linear16', sampleRate: 16_000 },
              output: { encoding: 'linear16', sampleRate: 24_000 },
            },
            reconnect: { enabled: true, maxAttempts: 3 },
          })
          const microphone = new AgentMicrophone((chunk) => session.sendAudio(chunk), {
            sampleRate: 16_000,
            echoCancellation: true,
            noiseSuppression: true,
          })
          const player = new AgentPlayer({ sampleRate: 24_000 })
          return { session, microphone, player }
        },
      }),
    [agentId],
  )

  useEffect(() => () => adapter.stop(), [adapter])

  return (
    <Orb
      adapter={adapter}
      theme="circle"
      aria-label="Start or stop your Deepgram voice assistant"
    />
  )
}

// Complete published Deepgram React component, checked against current SDK types.

function ProviderOrb({ error }: { error?: unknown }) {
  const context = useAgentContext()
  const latest = useRef({ ...context, error })
  latest.current = { ...context, error }
  const adapter = useMemo(
    () =>
      createDeepgramReactAdapter({
        getSnapshot: () => latest.current,
        start: () => latest.current.start(),
        stop: () => latest.current.stop(),
      }),
    [],
  )
  useEffect(() => () => adapter.stop?.(), [adapter])
  return <Orb adapter={adapter} theme="circle" aria-label="Start or stop Deepgram" />
}

export function ExistingDeepgramProvider({ agentId }: { agentId: string }) {
  const [error, setError] = useState<unknown>()
  const config = useMemo(
    () => ({
      agent: agentId,
      auth: {
        tokenFactory: async () => {
          setError(undefined)
          const response = await fetch('/api/deepgram-token', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
          })
          if (!response.ok) throw new Error('Call authorization failed.')
          const { access_token } = await response.json()
          if (typeof access_token !== 'string') throw new Error('Invalid token response.')
          return access_token
        },
      },
    }),
    [agentId],
  )
  return (
    <AgentProvider config={config} autoStart={false} onError={setError} onSdkError={setError}>
      <ProviderOrb error={error} />
    </AgentProvider>
  )
}
