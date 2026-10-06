import type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState } from '../types'
import {
  createVolumeNormalizer,
  DEFAULT_VOLUME_CALIBRATION,
  type VolumeCalibrationSource,
} from '../audio-level'

export interface AgoraAgentStateEvent {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'silent'
  turnID: number
  timestamp: number
  reason: string
}

/** Current AgoraVoiceAI surface. ConversationalAIAPI remains an SDK alias. */
export interface AgoraToolkitLike {
  on(
    event: 'agent-state-changed',
    handler: (uid: string, event: AgoraAgentStateEvent) => void,
  ): unknown
  on(
    event: 'agent-thinking-changed' | 'agent-speaking-changed',
    handler: (uid: string, active: boolean) => void,
  ): unknown
  on(
    event: 'agent-interrupted',
    handler: (uid: string, event: { turnID: number; timestamp: number }) => void,
  ): unknown
  on(
    event: 'agent-error' | 'message-error',
    handler: (uid: string, error: unknown) => void,
  ): unknown
  off(
    event: 'agent-state-changed',
    handler: (uid: string, event: AgoraAgentStateEvent) => void,
  ): unknown
  off(
    event: 'agent-thinking-changed' | 'agent-speaking-changed',
    handler: (uid: string, active: boolean) => void,
  ): unknown
  off(
    event: 'agent-interrupted',
    handler: (uid: string, event: { turnID: number; timestamp: number }) => void,
  ): unknown
  off(
    event: 'agent-error' | 'message-error',
    handler: (uid: string, error: unknown) => void,
  ): unknown
  interrupt(agentUserId: string): Promise<void>
}

export interface AgoraRTCClientLike {
  readonly connectionState: string
  on(
    event: 'connection-state-change',
    handler: (current: string, previous: string, reason?: string) => void,
  ): unknown
  off(
    event: 'connection-state-change',
    handler: (current: string, previous: string, reason?: string) => void,
  ): unknown
}

export interface AgoraAudioTrackLike {
  getVolumeLevel(): number
  readonly enabled?: boolean
}

export interface AgoraRemoteAudioTrackLike extends AgoraAudioTrackLike {
  /** Audio must already be played by the application, after RTC subscribe(). */
  readonly isPlaying: boolean
}

export interface AgoraSession {
  toolkit: AgoraToolkitLike
  rtc: AgoraRTCClientLike
  /** The agent UID returned by your backend, not a guessed participant. */
  agentUserId: string
  getMicrophoneTrack(): AgoraAudioTrackLike | undefined
  getAgentAudioTrack(): AgoraRemoteAudioTrackLike | undefined
  /** Close mic, stop remote playback, unsubscribe/destroy toolkit, leave RTC/RTM, end backend agent. */
  close(): void | Promise<void>
}

export interface AgoraAdapterOptions {
  /** Your application owns authenticated session creation, RTC/RTM audio, and scoped tokens. */
  createSession(signal: AbortSignal): Promise<AgoraSession>
  /** Includes permission and backend/RTC readiness. Default: 30 seconds. */
  startTimeoutMs?: number
  inputVolumeCalibration?: VolumeCalibrationSource
  outputVolumeCalibration?: VolumeCalibrationSource
}

export interface AgoraOrbAdapter extends OrbAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  /** Publishing the interruption is not confirmation; wait for toolkit events. */
  interrupt(): Promise<void>
}

interface Attempt {
  abort: AbortController
  session?: AgoraSession
  disposed: boolean
  thinking: boolean
  producing: boolean
  interrupted: boolean
  lastAudibleAt: number
  lastTimestamp: number
  lastTurn: number
  poll?: ReturnType<typeof setInterval>
  timeout?: ReturnType<typeof setTimeout>
  removers: (() => void)[]
  closed?: Promise<void>
  failure?: unknown
}

/** Observes your toolkit/RTC session; never opens another capture or playback path. */
export function createAgoraAdapter(options: AgoraAdapterOptions): AgoraOrbAdapter {
  const listeners = new Set<OrbSignalListener>()
  const input = createVolumeNormalizer(DEFAULT_VOLUME_CALIBRATION, options.inputVolumeCalibration)
  const output = createVolumeNormalizer(DEFAULT_VOLUME_CALIBRATION, options.outputVolumeCalibration)
  let signal: OrbSignal = { state: 'idle', inputVolume: 0, outputVolume: 0 }
  let active: Attempt | undefined
  let starting: Promise<void> | undefined

  function emit(state: OrbState, inputVolume = 0, outputVolume = 0, error?: unknown) {
    signal = { state, inputVolume, outputVolume, ...(error === undefined ? {} : { error }) }
    listeners.forEach((listener) => listener(signal))
  }

  function reset(call: Attempt) {
    call.thinking = false
    call.producing = false
    call.lastAudibleAt = -Infinity
    input.reset()
    output.reset()
  }

  function cleanup(call: Attempt): Promise<void> {
    if (call.closed) return call.closed
    call.disposed = true
    call.abort.abort()
    if (active === call) active = undefined
    if (call.poll !== undefined) clearInterval(call.poll)
    if (call.timeout !== undefined) clearTimeout(call.timeout)
    call.removers.forEach((remove) => remove())
    reset(call)
    call.closed = Promise.resolve()
      .then(() => call.session?.close())
      .then(() => undefined)
    return call.closed
  }

  function fail(call: Attempt, error: unknown) {
    if (call.disposed) return
    call.failure = error
    emit('error', 0, 0, error)
    void cleanup(call).catch(() => undefined)
  }

  function sample(call: Attempt) {
    if (call.disposed || !call.session) return
    if (call.session.rtc.connectionState !== 'CONNECTED') {
      if (
        call.session.rtc.connectionState === 'CONNECTING' ||
        call.session.rtc.connectionState === 'RECONNECTING'
      ) {
        reset(call)
        emit('connecting')
      }
      return
    }
    try {
      const microphone = call.session.getMicrophoneTrack()
      const track = call.session.getAgentAudioTrack()
      const rawOutput = !call.interrupted && track?.isPlaying ? track.getVolumeLevel() : 0
      const now = performance.now()
      if (rawOutput > 0.001) call.lastAudibleAt = now
      // Short silence hold covers syllable gaps, never provider generation alone.
      const speaking = !call.interrupted && !!track?.isPlaying && now - call.lastAudibleAt < 180
      const state = speaking
        ? 'speaking'
        : call.thinking || call.producing
          ? 'thinking'
          : 'listening'
      emit(
        state,
        input.sample(microphone?.enabled === false ? 0 : (microphone?.getVolumeLevel() ?? 0))
          .normalized,
        speaking ? output.sample(rawOutput).normalized : 0,
      )
    } catch (error) {
      fail(call, error)
    }
  }

  function bind(call: Attempt, session: AgoraSession) {
    const isCurrent = (uid: string) =>
      !call.disposed && uid === session.agentUserId && session.rtc.connectionState === 'CONNECTED'
    const fresh = (event: { turnID: number; timestamp: number }) => {
      if (event.turnID < call.lastTurn || event.timestamp < call.lastTimestamp) return false
      call.lastTurn = event.turnID
      call.lastTimestamp = event.timestamp
      return true
    }
    const stateChanged = (uid: string, event: AgoraAgentStateEvent) => {
      if (!isCurrent(uid) || !fresh(event)) return
      call.thinking = event.state === 'thinking'
      call.producing = event.state === 'speaking'
      if (call.thinking || call.producing) call.interrupted = false
      sample(call)
    }
    const thinkingChanged = (uid: string, thinking: boolean) => {
      if (!isCurrent(uid)) return
      call.thinking = thinking
      if (thinking) call.interrupted = false
      sample(call)
    }
    const speakingChanged = (uid: string, producing: boolean) => {
      if (!isCurrent(uid)) return
      call.producing = producing
      if (producing) call.interrupted = false
      sample(call)
    }
    const interrupted = (uid: string, event: { turnID: number; timestamp: number }) => {
      if (!isCurrent(uid) || !fresh(event)) return
      reset(call)
      call.interrupted = true
      sample(call)
    }
    const error = (uid: string, cause: unknown) => {
      if (isCurrent(uid)) fail(call, cause)
    }
    const connectionChanged = (current: string) => {
      if (call.disposed) return
      if (current === 'DISCONNECTED') {
        fail(call, new Error('Agora RTC disconnected. Start a new application session to retry.'))
      } else if (current === 'CONNECTING' || current === 'RECONNECTING') {
        reset(call)
        call.interrupted = true
        emit('connecting')
      } else if (current === 'CONNECTED') {
        call.interrupted = false
        sample(call)
      }
    }
    session.toolkit.on('agent-state-changed', stateChanged)
    session.toolkit.on('agent-thinking-changed', thinkingChanged)
    session.toolkit.on('agent-speaking-changed', speakingChanged)
    session.toolkit.on('agent-interrupted', interrupted)
    session.toolkit.on('agent-error', error)
    session.toolkit.on('message-error', error)
    session.rtc.on('connection-state-change', connectionChanged)
    call.removers.push(
      () => session.toolkit.off('agent-state-changed', stateChanged),
      () => session.toolkit.off('agent-thinking-changed', thinkingChanged),
      () => session.toolkit.off('agent-speaking-changed', speakingChanged),
      () => session.toolkit.off('agent-interrupted', interrupted),
      () => session.toolkit.off('agent-error', error),
      () => session.toolkit.off('message-error', error),
      () => session.rtc.off('connection-state-change', connectionChanged),
    )
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      listener(signal)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          if (active) void cleanup(active).catch(() => undefined)
          emit('idle')
        }
      }
    },
    start() {
      if (starting && active) return starting
      if (active) return Promise.resolve()
      const call: Attempt = {
        abort: new AbortController(),
        disposed: false,
        thinking: false,
        producing: false,
        interrupted: false,
        lastAudibleAt: -Infinity,
        lastTimestamp: -Infinity,
        lastTurn: -Infinity,
        removers: [],
      }
      active = call
      emit('connecting')
      const cancelled = new Promise<never>((_, reject) => {
        call.abort.signal.addEventListener(
          'abort',
          () => reject(call.failure ?? new DOMException('Agora start cancelled.', 'AbortError')),
          { once: true },
        )
      })
      call.timeout = setTimeout(
        () => fail(call, new Error('Agora application session timed out.')),
        options.startTimeoutMs ?? 30_000,
      )
      // Invoke immediately so application microphone capture starts from the gesture.
      let provision: Promise<AgoraSession>
      try {
        provision = options.createSession(call.abort.signal)
      } catch (error) {
        fail(call, error)
        provision = Promise.reject(error)
      }
      const connected = provision.then(async (session) => {
        if (call.disposed) {
          await session.close() // A provider factory may finish after abort/unmount.
          throw new DOMException('Agora start cancelled.', 'AbortError')
        }
        call.session = session
        if (session.rtc.connectionState !== 'CONNECTED')
          throw new Error('createSession must return a connected Agora RTC session.')
        bind(call, session)
        if (call.timeout !== undefined) clearTimeout(call.timeout)
        call.poll = setInterval(() => sample(call), 1000 / 30)
        sample(call)
      })
      const result = Promise.race([connected, cancelled])
        .catch((error: unknown) => {
          fail(call, error)
          throw error
        })
        .finally(() => {
          if (starting === result) starting = undefined
        })
      starting = result
      return result
    },
    async stop() {
      starting = undefined
      const call = active
      if (call) {
        try {
          await cleanup(call)
        } catch (error) {
          emit('error', 0, 0, error)
          throw error
        }
      }
      if (!active) emit('idle')
    },
    async interrupt() {
      const call = active
      if (!call?.session || call.disposed) return
      try {
        await call.session.toolkit.interrupt(call.session.agentUserId)
      } catch (error) {
        fail(call, error)
        throw error
      }
    },
  }
}
