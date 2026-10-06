import type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState } from '../types'
import {
  createVolumeNormalizer,
  DEFAULT_VOLUME_CALIBRATION,
  type VolumeCalibrationSource,
} from '../audio-level'

export type DeepgramConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

type SessionEvent =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'settings-applied'
  | 'user-started-speaking'
  | 'agent-thinking'
  | 'agent-started-speaking'
  | 'agent-audio-done'
  | 'error'
  | 'sdk-error'

/** Structural surface of @deepgram/agents; the application installs its own SDK. */
export interface DeepgramSessionLike {
  readonly state: DeepgramConnectionState
  on(event: SessionEvent, listener: (value?: unknown) => void): unknown
  on(event: 'audio', listener: (chunk: ArrayBuffer) => void): unknown
  off(event: SessionEvent, listener: (value?: unknown) => void): unknown
  off(event: 'audio', listener: (chunk: ArrayBuffer) => void): unknown
  connect(): Promise<void>
  disconnect(): void
  sendAudio(data: ArrayBuffer): void
}

export interface DeepgramMicrophoneLike {
  start(): Promise<void>
  stop(): void
  readonly muted: boolean
  getInputVolume(): number
  on(event: 'error', listener: (error: Error) => void): unknown
  off(event: 'error', listener: (error: Error) => void): unknown
}

export interface DeepgramPlayerLike {
  queue(chunk: ArrayBuffer): void
  interrupt(): void
  dispose(): void
  readonly muted: boolean
  getRemainingPlaybackTime(): number
  getOutputVolume(): number
}

export interface DeepgramResources {
  session: DeepgramSessionLike
  microphone: DeepgramMicrophoneLike
  player: DeepgramPlayerLike
}

export interface DeepgramAdapterOptions {
  /** Create fresh SDK audio resources per start. Never reuse a disposed player. */
  createResources(): DeepgramResources
  /** Startup deadline includes permission and SettingsApplied. Default: 30 seconds. */
  startTimeoutMs?: number
  inputVolumeCalibration?: VolumeCalibrationSource
  outputVolumeCalibration?: VolumeCalibrationSource
}

export interface DeepgramOrbAdapter extends OrbAdapter {
  start(): Promise<void>
  stop(): void
}

interface ActiveSession extends DeepgramResources {
  disposed: boolean
  ready: boolean
  capturing: boolean
  generating: boolean
  heardAudio: boolean
  ignoreAudio: boolean
  removers: (() => void)[]
  poll?: ReturnType<typeof setInterval>
  timeout?: ReturnType<typeof setTimeout>
  resolve?: () => void
  reject?: (error: unknown) => void
}

/** Owns the injected SDK resources, not a second microphone or playback engine. */
export function createDeepgramAdapter(options: DeepgramAdapterOptions): DeepgramOrbAdapter {
  const listeners = new Set<OrbSignalListener>()
  const input = createVolumeNormalizer(DEFAULT_VOLUME_CALIBRATION, options.inputVolumeCalibration)
  const output = createVolumeNormalizer(DEFAULT_VOLUME_CALIBRATION, options.outputVolumeCalibration)
  let signal: OrbSignal = { state: 'idle', inputVolume: 0, outputVolume: 0 }
  let active: ActiveSession | undefined
  let starting: Promise<void> | undefined

  function emit(state: OrbState, inputVolume = 0, outputVolume = 0, error?: unknown) {
    signal = { state, inputVolume, outputVolume, ...(error === undefined ? {} : { error }) }
    listeners.forEach((listener) => listener(signal))
  }

  function reset() {
    input.reset()
    output.reset()
  }

  function cleanup(call: ActiveSession) {
    if (call.disposed) return
    call.disposed = true
    if (active === call) active = undefined
    if (call.poll !== undefined) clearInterval(call.poll)
    if (call.timeout !== undefined) clearTimeout(call.timeout)
    call.removers.forEach((remove) => remove())
    call.microphone.stop()
    call.player.interrupt()
    call.player.dispose()
    call.session.disconnect()
    reset()
  }

  function fail(call: ActiveSession, error: unknown) {
    if (call.disposed) return
    call.reject?.(error)
    cleanup(call)
    emit('error', 0, 0, error)
  }

  function sample(call: ActiveSession) {
    if (call.disposed || !call.ready || !call.capturing) return
    try {
      const rawOutput = call.player.muted ? 0 : call.player.getOutputVolume()
      const remaining = call.player.muted ? 0 : call.player.getRemainingPlaybackTime()
      if (rawOutput > 0.001 && !call.ignoreAudio) call.heardAudio = true
      const speaking = call.heardAudio && remaining > 0 && !call.ignoreAudio
      if (!speaking && remaining <= 0) call.heardAudio = false
      const next = speaking ? 'speaking' : call.generating ? 'thinking' : 'listening'
      emit(
        next,
        input.sample(call.microphone.muted ? 0 : call.microphone.getInputVolume()).normalized,
        speaking ? output.sample(rawOutput).normalized : 0,
      )
    } catch (error) {
      fail(call, error)
    }
  }

  function maybeReady(call: ActiveSession) {
    if (call.disposed || !call.ready || !call.capturing) return
    if (call.timeout !== undefined) clearTimeout(call.timeout)
    call.resolve?.()
    call.resolve = undefined
    call.reject = undefined
    sample(call)
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      listener(signal)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          const call = active
          if (call) {
            call.reject?.(new DOMException('Deepgram start cancelled.', 'AbortError'))
            cleanup(call)
          }
          emit('idle')
        }
      }
    },
    start() {
      if (starting && active) return starting
      if (active) return Promise.resolve()
      reset()
      emit('connecting')
      let call: ActiveSession
      try {
        call = {
          ...options.createResources(),
          disposed: false,
          ready: false,
          capturing: false,
          generating: false,
          heardAudio: false,
          ignoreAudio: false,
          removers: [],
        }
      } catch (error) {
        emit('error', 0, 0, error)
        return Promise.reject(error)
      }
      active = call
      const ready = new Promise<void>((resolve, reject) => {
        call.resolve = resolve
        call.reject = reject
      })
      const bind = (event: SessionEvent, handler: (value?: unknown) => void) => {
        const guarded = (value?: unknown) => {
          if (!call.disposed) handler(value)
        }
        call.session.on(event, guarded)
        call.removers.push(() => call.session.off(event, guarded))
      }
      bind('connecting', () => emit('connecting'))
      bind('connected', () => {
        // Socket-open precedes SettingsApplied; it is not agent readiness.
      })
      bind('reconnecting', () => {
        call.ready = false
        call.generating = false
        call.heardAudio = false
        call.ignoreAudio = true
        call.player.interrupt()
        reset()
        emit('connecting')
      })
      bind('settings-applied', () => {
        call.ready = true
        call.ignoreAudio = false
        maybeReady(call)
      })
      bind('user-started-speaking', () => {
        call.player.interrupt()
        call.heardAudio = false
        call.generating = false
        call.ignoreAudio = true
        output.reset()
        sample(call)
      })
      bind('agent-thinking', () => {
        if (!call.ready) return
        call.generating = true
        call.ignoreAudio = false
        sample(call)
      })
      bind('agent-started-speaking', () => {
        if (!call.ready) return
        call.generating = true
        call.ignoreAudio = false
        sample(call)
      })
      bind('agent-audio-done', () => {
        call.generating = false
        sample(call)
      })
      bind('error', (error) => fail(call, error ?? new Error('Deepgram agent error.')))
      bind('sdk-error', (error) => {
        // Transport errors may be followed by SDK-managed reconnecting.
        call.player.interrupt()
        call.heardAudio = false
        reset()
        emit('error', 0, 0, error ?? new Error('Deepgram transport error.'))
      })
      bind('disconnected', (reason) =>
        fail(call, new Error(`Deepgram disconnected: ${String(reason ?? 'connection closed')}`)),
      )
      const audio = (chunk: ArrayBuffer) => {
        if (call.disposed || !call.ready || call.ignoreAudio) return
        try {
          call.player.queue(chunk)
          sample(call)
        } catch (error) {
          fail(call, error)
        }
      }
      call.session.on('audio', audio)
      call.removers.push(() => call.session.off('audio', audio))
      const microphoneError = (error: Error) => fail(call, error)
      call.microphone.on('error', microphoneError)
      call.removers.push(() => call.microphone.off('error', microphoneError))
      call.poll = setInterval(() => sample(call), 1000 / 30)
      call.timeout = setTimeout(
        () => fail(call, new Error('Deepgram microphone or agent readiness timed out.')),
        options.startTimeoutMs ?? 30_000,
      )
      // Request permission in the click handler, before any network await.
      try {
        void call.microphone.start().then(
          () => {
            if (call.disposed) {
              call.microphone.stop() // Permission may resolve after stop/unmount.
              return
            }
            call.capturing = true
            maybeReady(call)
          },
          (error) => fail(call, error),
        )
        void call.session.connect().catch((error: unknown) => fail(call, error))
      } catch (error) {
        fail(call, error)
      }
      const result = ready.finally(() => {
        if (starting === result) starting = undefined
      })
      starting = result
      return result
    },
    stop() {
      starting = undefined
      const call = active
      if (call) {
        call.reject?.(new DOMException('Deepgram start cancelled.', 'AbortError'))
        cleanup(call)
      }
      reset()
      emit('idle')
    },
  }
}

export interface DeepgramReactSnapshot {
  state: DeepgramConnectionState
  mode: 'idle' | 'listening' | 'thinking' | 'speaking'
  micActive: boolean
  micMuted: boolean
  outputMuted: boolean
  getInputVolume(): number
  getOutputVolume(): number
  error?: unknown
}

export interface DeepgramReactAdapterOptions {
  /** Read the latest useAgentContext() value through a React ref. */
  getSnapshot(): DeepgramReactSnapshot
  start(): Promise<void>
  stop(): void
}

/** Observe an existing AgentProvider. Deepgram retains capture/playback ownership. */
export function createDeepgramReactAdapter(
  options: DeepgramReactAdapterOptions,
): DeepgramOrbAdapter {
  const listeners = new Set<OrbSignalListener>()
  let timer: ReturnType<typeof setInterval> | undefined
  let pending: Promise<void> | undefined
  let error: unknown
  let stopped = false
  let generation = 0
  let heardAudio = false
  const volume = (raw: number) => (Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0)
  function sample() {
    try {
      const snapshot = options.getSnapshot()
      const outputVolume =
        snapshot.state === 'connected' && snapshot.mode === 'speaking' && !snapshot.outputMuted
          ? volume(snapshot.getOutputVolume())
          : 0
      if (snapshot.mode !== 'speaking' || snapshot.outputMuted || snapshot.state !== 'connected')
        heardAudio = false
      if (outputVolume > 0.001) heardAudio = true
      const state: OrbState =
        error !== undefined || snapshot.error !== undefined
          ? 'error'
          : stopped
            ? 'idle'
            : snapshot.state === 'connecting' || snapshot.state === 'reconnecting'
              ? 'connecting'
              : snapshot.state === 'connected'
                ? snapshot.mode === 'speaking' && (snapshot.outputMuted || !heardAudio)
                  ? snapshot.outputMuted
                    ? 'listening'
                    : 'thinking'
                  : snapshot.mode === 'idle'
                    ? 'listening'
                    : snapshot.mode
                : 'idle'
      const connected = state !== 'idle' && state !== 'connecting' && state !== 'error'
      const signal: OrbSignal = {
        state,
        inputVolume:
          connected && snapshot.micActive && !snapshot.micMuted
            ? volume(snapshot.getInputVolume())
            : 0,
        outputVolume: state === 'speaking' ? outputVolume : 0,
        ...(state === 'error' ? { error: error ?? snapshot.error } : {}),
      }
      listeners.forEach((listener) => listener(signal))
    } catch (cause) {
      error = cause
      listeners.forEach((listener) =>
        listener({ state: 'error', inputVolume: 0, outputVolume: 0, error: cause }),
      )
    }
  }
  return {
    subscribe(listener) {
      listeners.add(listener)
      if (timer === undefined) timer = setInterval(sample, 1000 / 30)
      sample()
      return () => {
        listeners.delete(listener)
        if (!listeners.size && timer !== undefined) {
          clearInterval(timer)
          timer = undefined
        }
      }
    },
    start() {
      if (pending) return pending
      const current = ++generation
      heardAudio = false
      error = undefined
      stopped = false
      // Invoke before a Promise/microtask boundary to retain the click gesture.
      let start: Promise<void>
      try {
        start = options.start()
      } catch (cause) {
        start = Promise.reject(cause)
      }
      const result = start
        .catch((cause: unknown) => {
          if (generation === current) {
            error = cause
            options.stop()
            sample()
          }
          throw cause
        })
        .finally(() => {
          if (pending === result) pending = undefined
        })
      pending = result
      return result
    },
    stop() {
      generation++
      heardAudio = false
      pending = undefined
      stopped = true
      error = undefined
      options.stop()
      sample()
    },
  }
}
