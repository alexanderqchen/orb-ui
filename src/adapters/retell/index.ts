import type { OrbAdapter, OrbSignal, OrbSignalListener } from '../types'
import { createVolumeNormalizer } from '../audio-level'
import type { VolumeCalibrationSource, VolumeSample } from '../audio-level'

/** The public session statuses in retell-client-js-sdk 3.0.2. */
export type RetellSessionStatus =
  | 'connecting'
  | 'live'
  | 'monitoring'
  | 'listening'
  | 'taken_over'
  | 'ended'

/** Hooks documented by the current Retell browser web-call guide. */
export interface RetellSessionHooks {
  onStatus?: (status: RetellSessionStatus) => void
  onAudio?: (samples: Float32Array) => void
  onEnd?: (event: { disconnection_reason?: string }) => void
  onError?: (error: Error) => void
}

export interface RetellWebCallOptions {
  agent_id: string
  agent_version?: number
  metadata?: Record<string, unknown>
  retell_llm_dynamic_variables?: Record<string, unknown>
  agent_override?: unknown
  tool_mocks?: unknown
  current_node_id?: string
  current_state?: string
  recaptchaToken?: string
  extra?: Record<string, unknown>
  transcript?: boolean
  audio?: {
    sampleRate?: number
    captureDeviceId?: string
    playbackDeviceId?: string
    emitRawAudioSamples?: boolean
  }
  hooks?: RetellSessionHooks
}

export interface RetellWebCallSession {
  status: RetellSessionStatus
  /** Resolves after the SDK connects audio; rejects on creation/audio failure. */
  ready: Promise<void>
  end(): Promise<void>
  startAudioPlayback(): Promise<void>
  /** Current SDK analyzer exposes the actual browser audio-context state. */
  analyzerComponent?: { analyser: { context: { state: string } } }
}

/** Injectable SDK contract; orb-ui never imports or bundles the Retell SDK. */
export interface RetellClientLike {
  createWebCall(options: RetellWebCallOptions): RetellWebCallSession
}

export interface RetellAdapterOptions {
  /** Resolve fresh call options on every start, including any reCAPTCHA token. */
  getCallOptions(signal: AbortSignal): RetellWebCallOptions | Promise<RetellWebCallOptions>
  /** Overrides for output PCM RMS. No live provider calibration is claimed. */
  outputVolumeCalibration?: VolumeCalibrationSource
  onOutputVolumeSample?: (sample: VolumeSample) => void
  /** PCM RMS activity threshold; incoming background sound can also cross it. Default 0.01. */
  outputActivityThreshold?: number
  /** Speaking estimate expires after this many ms without active output. Default 180. */
  outputActivityHoldMs?: number
  /** Override the SDK audio-context gate, e.g. when your app mutes output. */
  isAudioPlaybackActive?: (session: RetellWebCallSession) => boolean
  /** End an adapter-owned call when its final subscriber leaves. Defaults to true. */
  stopOnUnsubscribe?: boolean
}

export type RetellTurnObserver = (state: 'thinking' | 'listening' | 'interrupted') => void

export interface RetellOrbAdapter extends OrbAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  /** Invoke from a user gesture when the browser blocks SDK audio playback. */
  resumeAudio(): Promise<void>
  /** Get a session-scoped observer for explicit app-owned turn submission/interruption. */
  getTurnObserver(): RetellTurnObserver
}

/** Creates an adapter for one current Retell browser WebCall at a time. */
export function createRetellAdapter(
  client: RetellClientLike,
  options: RetellAdapterOptions,
): RetellOrbAdapter {
  const listeners = new Set<OrbSignalListener>()
  const output = createVolumeNormalizer(
    {
      amplitude: { silenceFloor: 0.003, speechReference: 0.08, speechPeak: 0.3 },
      envelope: { riseTimeMs: 100, fallTimeMs: 200 },
    },
    options.outputVolumeCalibration,
  )
  let signal: OrbSignal = { state: 'idle', inputVolume: 0, outputVolume: 0 }
  let generation = 0
  let activeCall: RetellWebCallSession | undefined
  let controller: AbortController | undefined
  let startPromise: Promise<void> | undefined
  let stopPromise: Promise<void> | undefined
  let awaitingResponse = false
  let interrupted = false
  let activityTimer: ReturnType<typeof setTimeout> | undefined
  const threshold = Number.isFinite(options.outputActivityThreshold)
    ? Math.max(0.000001, Math.min(1, options.outputActivityThreshold!))
    : 0.01
  const holdMs = Number.isFinite(options.outputActivityHoldMs)
    ? Math.max(20, Math.min(2000, options.outputActivityHoldMs!))
    : 180

  function clearActivity() {
    clearTimeout(activityTimer)
    activityTimer = undefined
    output.reset()
  }

  function waitingState() {
    return awaitingResponse ? ('thinking' as const) : ('listening' as const)
  }

  function emit(next: OrbSignal) {
    signal = next
    listeners.forEach((listener) => listener(next))
  }

  function reset(state: 'idle' | 'connecting' | 'error', error?: unknown) {
    awaitingResponse = false
    interrupted = false
    clearActivity()
    emit({ state, inputVolume: 0, outputVolume: 0, ...(error === undefined ? {} : { error }) })
  }

  function finish(id: number) {
    if (id !== generation) return
    generation += 1
    controller = undefined
    activeCall = undefined
    // Retell fires error before end on a connection failure. Preserve that error.
    if (signal.state !== 'error') reset('idle')
  }

  async function startCall() {
    const id = ++generation
    const abort = new AbortController()
    controller = abort
    reset('connecting')
    const current = () => id === generation && !abort.signal.aborted
    let connectionError: unknown
    try {
      const callOptions = await options.getCallOptions(abort.signal)
      if (!current()) return
      const appHooks = callOptions.hooks
      const hooks: RetellSessionHooks = {
        onStatus(status) {
          if (!current()) return
          if (status === 'ended') {
            if (signal.state !== 'error') reset('idle')
          } else if (status === 'connecting') reset('connecting')
          else if (status === 'live' && signal.state !== 'error') {
            emit({ ...signal, state: waitingState(), error: undefined })
          }
          appHooks?.onStatus?.(status)
        },
        onAudio(samples) {
          if (!current() || signal.state === 'error' || activeCall?.status !== 'live') return
          const audible = options.isAudioPlaybackActive
            ? options.isAudioPlaybackActive(activeCall)
            : activeCall.analyzerComponent?.analyser.context.state === 'running'
          if (!audible) {
            clearActivity()
            emit({ ...signal, state: waitingState(), outputVolume: 0 })
            return
          }
          let squares = 0
          for (const value of samples) squares += Number.isFinite(value) ? value * value : 0
          const raw = samples.length ? Math.sqrt(squares / samples.length) : 0
          const sample = output.sample(raw)
          options.onOutputVolumeSample?.(sample)
          if (interrupted && raw < threshold) interrupted = false
          if (raw >= threshold && !interrupted) {
            // This is audible output activity, not a semantic speech boundary.
            awaitingResponse = false
            clearTimeout(activityTimer)
            emit({ ...signal, state: 'speaking', outputVolume: sample.normalized })
            activityTimer = setTimeout(() => {
              if (!current() || signal.state === 'error') return
              clearActivity()
              emit({ ...signal, state: waitingState(), outputVolume: 0 })
            }, holdMs)
          } else {
            emit({ ...signal, outputVolume: signal.state === 'speaking' ? sample.normalized : 0 })
          }
          appHooks?.onAudio?.(samples)
        },
        onError(error) {
          if (!current()) return
          connectionError = error
          reset('error', error)
          appHooks?.onError?.(error)
        },
        onEnd(event) {
          if (!current()) return
          finish(id)
          appHooks?.onEnd?.(event)
        },
      }
      const call = client.createWebCall({
        ...callOptions,
        audio: { ...callOptions.audio, emitRawAudioSamples: true },
        hooks,
      })
      if (!current()) {
        // A custom factory may synchronously end/error the call during construction.
        await call.end()
        return
      }
      activeCall = call
      await call.ready
      if (current() && signal.state === 'connecting' && call.status === 'live') {
        emit({ ...signal, state: 'listening' })
      }
    } catch (error) {
      if (!current()) {
        // SDK failures emit error/end before rejecting ready. Explicit stop wins.
        if (connectionError !== undefined && !abort.signal.aborted) throw connectionError
        return
      }
      reset('error', error)
      // A failed factory/ready promise must release the SDK's microphone/transport.
      const failedCall = activeCall
      activeCall = undefined
      generation += 1
      abort.abort()
      try {
        await failedCall?.end()
      } catch {
        // Keep the original connection error visible.
      }
      throw error
    }
  }

  function stop() {
    if (stopPromise) return stopPromise
    generation += 1
    controller?.abort()
    controller = undefined
    startPromise = undefined
    const call = activeCall
    activeCall = undefined
    reset('idle')
    const operation = (async () => {
      try {
        await call?.end()
      } catch (error) {
        reset('error', error)
        throw error
      }
    })()
    stopPromise = operation
    void operation
      .finally(() => {
        if (stopPromise === operation) stopPromise = undefined
      })
      .catch(() => undefined)
    return operation
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      listener(signal)
      return () => {
        listeners.delete(listener)
        if (!listeners.size && options.stopOnUnsubscribe !== false) {
          void stop().catch(() => undefined)
        }
      }
    },
    start() {
      if (startPromise) return startPromise
      if (activeCall && signal.state !== 'error') return Promise.resolve()
      const pendingStop = activeCall ? stop() : stopPromise
      const request = generation
      const operation = (async () => {
        if (pendingStop) await pendingStop
        if (request !== generation) return
        await startCall()
      })()
      startPromise = operation
      void operation
        .finally(() => {
          if (startPromise === operation) startPromise = undefined
        })
        .catch(() => undefined)
      return operation
    },
    stop,
    getTurnObserver() {
      const id = generation
      return (state) => {
        if (id !== generation || activeCall?.status !== 'live' || signal.state === 'error') return
        awaitingResponse = state === 'thinking'
        if (state === 'thinking' && signal.state === 'speaking') return
        interrupted = state === 'interrupted'
        clearActivity()
        emit({ ...signal, state: waitingState(), outputVolume: 0 })
      }
    },
    async resumeAudio() {
      const call = activeCall
      if (!call) return
      const id = generation
      try {
        await call.startAudioPlayback()
        if (id === generation && signal.state === 'error') {
          emit({ ...signal, state: 'listening', error: undefined })
        }
      } catch (error) {
        if (id === generation) reset('error', error)
        throw error
      }
    },
  }
}
