import { useEffect, useMemo, useRef, useState } from 'react'
import { RetellClient } from 'retell-client-js-sdk'
import type { SessionHooks, WebCallOptions } from 'retell-client-js-sdk'
import { VoiceProvider, useMicFft, usePlayerFft, useVoice } from '@humeai/voice-react'
import type { JSONMessage, VoiceContextType, VoiceProviderProps } from '@humeai/voice-react'
import { Orb } from '../../src'
import { createRetellAdapter, createHumeAdapter, humeVoiceToOrbSignal } from '../../src/adapters'
import type { RetellClientLike, RetellSessionHooks } from '../../src/adapters/retell'
import type { HumeSessionBridge, HumeVoiceSnapshot } from '../../src/adapters/hume'
import type { OrbSignal } from '../../src/adapters'

// Compile-time verification against current published SDK declarations.
const retellClient: RetellClientLike = new RetellClient({ key: 'backend-owned-placeholder' })
const hooks: SessionHooks = {} satisfies RetellSessionHooks
const retellOptions: WebCallOptions = {
  agent_id: 'developer-agent',
  audio: { emitRawAudioSamples: true },
  hooks,
}
createRetellAdapter(retellClient, { getCallOptions: () => retellOptions })

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'The voice session could not continue.'
}

// An authenticated developer-owned backend implements both allowlisted routes.
const retellControlFetch: typeof fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  let endpoint: string
  if (url.pathname === '/v3/create-web-call') endpoint = '/api/retell/call'
  else {
    const match = /^\/v2\/stop-call\/([^/]+)$/.exec(url.pathname)
    if (!match) return Promise.reject(new Error('Unsupported Retell control request'))
    endpoint = `/api/retell/call/${match[1]}/stop`
  }
  // Discard the SDK Authorization placeholder; own backend authenticates its visitor.
  return fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: init?.body,
    signal: init?.signal,
  })
}

export function RetellVoiceExample({ agentId }: { agentId: string }) {
  const adapter = useMemo(() => {
    const client = new RetellClient({ key: 'backend-owned-placeholder', fetch: retellControlFetch })
    return createRetellAdapter(client, {
      getCallOptions: () => ({ agent_id: agentId, transcript: false }),
    })
  }, [agentId])
  const [signal, setSignal] = useState<OrbSignal>({ state: 'idle' })
  const [problem, setProblem] = useState('')
  useEffect(() => {
    const unsubscribe = adapter.subscribe(setSignal)
    return () => {
      unsubscribe()
      void adapter.stop().catch(() => undefined)
    }
  }, [adapter])
  const run = (operation: () => Promise<void>) => {
    setProblem('')
    void operation().catch((error: unknown) => setProblem(errorText(error)))
  }
  return (
    <section aria-label="Retell voice session">
      <Orb adapter={adapter} interactive={false} theme="circle" />
      <p role="status">{signal.state}</p>
      <button
        type="button"
        disabled={signal.state !== 'idle' && signal.state !== 'error'}
        onClick={() => run(adapter.start)}
      >
        Start voice
      </button>
      <button type="button" disabled={signal.state === 'idle'} onClick={() => run(adapter.stop)}>
        End voice
      </button>
      <button
        type="button"
        disabled={signal.state === 'idle'}
        onClick={() => run(adapter.resumeAudio)}
      >
        Enable speaker
      </button>
      {Boolean(problem || signal.error) && <p role="alert">{problem || errorText(signal.error)}</p>}
    </section>
  )
}

export function HumeVoiceExample() {
  const [isThinking, setThinking] = useState(false)
  const onMessage = (message: JSONMessage) => {
    if ((message.type === 'user_message' && !message.interim) || message.type === 'tool_call') {
      setThinking(true)
    }
    if (message.type === 'assistant_end' || message.type === 'user_interruption') setThinking(false)
  }
  return (
    <VoiceProvider onMessage={onMessage} onInterruption={() => setThinking(false)}>
      <HumeControls isThinking={isThinking} resetThinking={() => setThinking(false)} />
    </VoiceProvider>
  )
}

function HumeControls({
  isThinking,
  resetThinking,
}: {
  isThinking: boolean
  resetThinking(): void
}) {
  const voice = useVoice()
  const micFft = useMicFft()
  const playerFft = usePlayerFft()
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const request = useRef<AbortController>()
  const locked = useRef(false)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState('')
  useEffect(
    () => () => {
      request.current?.abort()
      void voiceRef.current.disconnect().catch(() => undefined)
    },
    [],
  )
  const observed = humeVoiceToOrbSignal({ ...voice, micFft, playerFft, isThinking })
  const signal: OrbSignal =
    pending && observed.state === 'idle' ? { ...observed, state: 'connecting' } : observed
  async function start() {
    if (locked.current || voiceRef.current.status.value === 'connected') return
    locked.current = true
    setPending(true)
    setProblem('')
    resetThinking()
    const abort = new AbortController()
    request.current = abort
    try {
      const response = await fetch('/api/hume/session', {
        method: 'POST',
        credentials: 'same-origin',
        signal: abort.signal,
      })
      if (!response.ok) throw new Error('Your Hume session endpoint rejected the request.')
      const token: { accessToken?: string; configId?: string } = await response.json()
      if (!token.accessToken) throw new Error('No short-lived Hume access token was returned.')
      if (abort.signal.aborted) return
      await voiceRef.current.connect({
        auth: { type: 'accessToken', value: token.accessToken },
        configId: token.configId,
      })
      if (abort.signal.aborted) await voiceRef.current.disconnect()
    } catch (error) {
      if (!abort.signal.aborted) {
        setProblem(errorText(error))
        await voiceRef.current.disconnect().catch(() => undefined)
      }
    } finally {
      locked.current = false
      if (!abort.signal.aborted) setPending(false)
      else if (request.current === abort) setPending(false)
    }
  }
  async function stop() {
    request.current?.abort()
    resetThinking()
    await voiceRef.current.disconnect().catch((error: unknown) => setProblem(errorText(error)))
  }
  return (
    <section aria-label="Hume EVI voice session">
      <Orb signal={signal} interactive={false} theme="circle" />
      <p role="status">{signal.state}</p>
      <button
        type="button"
        disabled={pending || voice.status.value === 'connected'}
        onClick={() => void start()}
      >
        Start voice
      </button>
      <button
        type="button"
        disabled={!pending && voice.status.value === 'disconnected'}
        onClick={() => void stop()}
      >
        End voice
      </button>
      {(problem || voice.error) && <p role="alert">{problem || voice.error?.message}</p>}
    </section>
  )
}

// A current useVoice() result is directly structurally compatible with the bridge.
function typecheckHumeContext(voice: VoiceContextType, message: JSONMessage) {
  const snapshot: HumeVoiceSnapshot = voice
  const adapter = createHumeAdapter({
    connect: async (session, abort) => {
      if (abort.aborted) return
      await voice.connect({ auth: { type: 'accessToken', value: 'developer-session-token' } })
      session.observe(voice)
    },
    disconnect: voice.disconnect,
  })
  const session: HumeSessionBridge = adapter.createSession()
  session.observe(snapshot)
  session.onMessage(message)
  const providerCallbacks: VoiceProviderProps = {
    onMessage: session.onMessage,
    onError: session.onError,
    onInterruption: session.onInterruption,
    onClose: session.close,
  }
  return (
    <VoiceProvider {...providerCallbacks}>
      <Orb adapter={adapter} interactive={false} />
    </VoiceProvider>
  )
}

void typecheckHumeContext
