import type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState } from '../types'
import { createVolumeNormalizer, type VolumeCalibrationSource } from '../audio-level'
import {
  createPcmBrowserAudio,
  type PcmBrowserAudio,
  type PcmBrowserAudioOptions,
} from './browser-audio'

export type { PcmBrowserAudioOptions } from './browser-audio'

/** Structural view of the SDK's deserialized server messages. */
export interface AzureVoiceLiveServerEvent {
  type: string
  delta?: unknown
  responseId?: string
  response?: { id?: string; status?: string }
  transcript?: string
  error?: { message?: string }
}

export interface AzureVoiceLiveHandlers {
  onServerEvent?: (event: AzureVoiceLiveServerEvent) => Promise<void>
  onError?: (args: { error: Error }) => Promise<void>
  onDisconnected?: (args: { code: number; reason: string }) => Promise<void>
}

/** Compatible with @azure/ai-voicelive 1.1.0, without importing the SDK at runtime. */
export interface AzureVoiceLiveSession {
  subscribe(handlers: AzureVoiceLiveHandlers): { close(): Promise<void> }
  connect(options?: { abortSignal?: AbortSignal; timeoutInMs?: number }): Promise<void>
  updateSession(options: {
    inputAudioFormat?: 'pcm16'
    inputAudioSamplingRate?: number
    outputAudioFormat?: 'pcm16'
    turnDetection?: {
      type: 'server_vad'
      threshold: number
      prefixPaddingInMs: number
      silenceDurationInMs: number
    }
  }): Promise<void>
  sendAudio(bytes: Uint8Array): Promise<void>
  dispose(): Promise<void>
}

export interface AzureVoiceLiveAdapterConfig<
  Session extends AzureVoiceLiveSession = AzureVoiceLiveSession,
> extends PcmBrowserAudioOptions {
  /** Return a fresh, unconnected SDK session. Resolve credentials on your own backend. */
  createSession(signal: AbortSignal): Session | Promise<Session>
  /** Configure model instructions, voice and tools using the concrete SDK session type. */
  configureSession?: (session: Session, signal: AbortSignal) => Promise<void>
  onEvent?: (event: AzureVoiceLiveServerEvent) => void
  startTimeoutMs?: number
  inputVolumeCalibration?: VolumeCalibrationSource
  outputVolumeCalibration?: VolumeCalibrationSource
}

export interface AzureVoiceLiveOrbAdapter extends OrbAdapter {
  start(): Promise<void>
  stop(): Promise<void>
}

interface ActiveSession<Session> {
  abort: AbortController
  sdk?: Session
  subscription?: { close(): Promise<void> }
  audio?: PcmBrowserAudio
  disposed: boolean
  ready: boolean
  userSpeaking: boolean
  responseComplete: boolean
  interruptedResponses: Set<string>
  responseId?: string
  pendingAudio: number
}

const PCM_CALIBRATION = {
  amplitude: { silenceFloor: 0.003, speechReference: 0.1, speechPeak: 0.3 },
  envelope: { riseTimeMs: 100, fallTimeMs: 400 },
}

/** SDK/session + mono PCM16 browser audio. Azure bills the application's own resource. */
export function createAzureVoiceLiveAdapter<Session extends AzureVoiceLiveSession>(
  config: AzureVoiceLiveAdapterConfig<Session>,
): AzureVoiceLiveOrbAdapter {
  const listeners = new Set<OrbSignalListener>()
  let signal: OrbSignal = { state: 'idle', inputVolume: 0, outputVolume: 0 }
  let active: ActiveSession<Session> | undefined
  let starting: Promise<void> | undefined
  let stopping: Promise<void> | undefined
  const input = createVolumeNormalizer(PCM_CALIBRATION, config.inputVolumeCalibration)
  const output = createVolumeNormalizer(PCM_CALIBRATION, config.outputVolumeCalibration)

  function emit(next: OrbSignal) {
    signal = next
    listeners.forEach((listener) => listener(next))
  }

  function state(next: OrbState, error?: unknown) {
    const reset = next === 'idle' || next === 'connecting' || next === 'error'
    if (reset) {
      input.reset()
      output.reset()
    }
    emit({
      state: next,
      inputVolume: reset ? 0 : signal.inputVolume,
      outputVolume: reset ? 0 : signal.outputVolume,
      ...(error === undefined ? {} : { error }),
    })
  }

  async function cleanup(session: ActiveSession<Session>, reason?: unknown) {
    if (session.disposed) return
    session.disposed = true
    session.abort.abort(reason ?? new DOMException('Voice session canceled.', 'AbortError'))
    if (active === session) active = undefined
    const results = await Promise.allSettled([
      session.audio?.close(),
      session.subscription?.close(),
      session.sdk?.dispose(),
    ])
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }

  function current(session: ActiveSession<Session>) {
    return active === session && !session.disposed && !session.abort.signal.aborted
  }

  function check(session: ActiveSession<Session>) {
    if (!current(session)) throw new DOMException('Voice session canceled.', 'AbortError')
  }

  function fail(session: ActiveSession<Session>, error: unknown) {
    if (!current(session)) return
    state('error', error)
    void cleanup(session, error).catch(() => undefined)
  }

  function finishResponse(session: ActiveSession<Session>) {
    if (session.audio?.hasOutput) return
    output.reset()
    emit({
      ...signal,
      state: session.userSpeaking || session.responseComplete ? 'listening' : 'thinking',
      outputVolume: 0,
    })
  }

  function handle(session: ActiveSession<Session>, event: AzureVoiceLiveServerEvent) {
    if (!current(session)) return
    if (event.type === 'input_audio_buffer.speech_started') {
      session.userSpeaking = true
      if (session.responseId) session.interruptedResponses.add(session.responseId)
      session.audio?.clear()
      output.reset()
      emit({ ...signal, state: 'listening', outputVolume: 0 })
    } else if (event.type === 'input_audio_buffer.speech_stopped') {
      session.userSpeaking = false
      state('thinking')
    } else if (event.type === 'response.created') {
      session.responseId = event.response?.id
      session.responseComplete = false
      if (!session.userSpeaking && !session.audio?.hasOutput) state('thinking')
    } else if (event.type === 'response.audio.delta') {
      if (!(event.delta instanceof Uint8Array)) throw new Error('Expected Azure SDK PCM bytes.')
      if (
        !session.userSpeaking &&
        (!event.responseId || !session.interruptedResponses.has(event.responseId))
      ) {
        session.audio?.play(event.delta)
      }
    } else if (event.type === 'response.done') {
      if (event.response?.id && session.interruptedResponses.has(event.response.id)) {
        session.interruptedResponses.delete(event.response.id)
      } else {
        session.responseComplete = true
        if (event.response?.status === 'failed') {
          throw new Error('Azure Voice Live response failed.')
        }
        finishResponse(session)
      }
    } else if (event.type === 'error') {
      throw new Error(event.error?.message ?? 'Azure Voice Live server error.')
    }
    config.onEvent?.(event)
  }

  async function connect(session: ActiveSession<Session>) {
    session.audio = createPcmBrowserAudio({
      ...config,
      inputSampleRate: 24_000,
      outputSampleRate: 24_000,
      onInput(bytes, rms) {
        if (!current(session)) return
        emit({ ...signal, inputVolume: input.sample(rms).normalized })
        if (!session.ready || !session.sdk) return
        if (session.pendingAudio >= 16) {
          fail(session, new Error('Azure microphone transport is falling behind.'))
          return
        }
        session.pendingAudio += 1
        void session.sdk
          .sendAudio(bytes)
          .catch((error) => fail(session, error))
          .finally(() => (session.pendingAudio -= 1))
      },
      onOutputVolume(rms) {
        if (current(session)) emit({ ...signal, outputVolume: output.sample(rms).normalized })
      },
      onPlayback(playing) {
        if (!current(session)) return
        if (playing && !session.userSpeaking) state('speaking')
        if (!playing) finishResponse(session)
      },
      onError(error) {
        fail(session, error)
      },
    })
    // Ask permission before starting a billable provider session.
    await session.audio.open()
    check(session)
    const sdk = await config.createSession(session.abort.signal)
    if (!current(session)) {
      await sdk.dispose()
      check(session)
    }
    session.sdk = sdk
    session.subscription = sdk.subscribe({
      onServerEvent: async (event) => {
        try {
          handle(session, event)
        } catch (error) {
          fail(session, error)
        }
      },
      onError: async ({ error }) => fail(session, error),
      onDisconnected: async ({ code, reason }) => {
        if (!current(session)) return
        if (!session.ready || code !== 1000) {
          fail(session, new Error(`Azure session disconnected (${code}): ${reason}`))
        } else {
          state('idle')
          void cleanup(session).catch(() => undefined)
        }
      },
    })
    await sdk.connect({
      abortSignal: session.abort.signal,
      timeoutInMs: config.startTimeoutMs ?? 30_000,
    })
    check(session)
    await sdk.updateSession({
      turnDetection: {
        type: 'server_vad',
        threshold: 0.5,
        prefixPaddingInMs: 300,
        silenceDurationInMs: 500,
      },
    })
    await config.configureSession?.(sdk, session.abort.signal)
    check(session)
    // The audio engine requires these wire formats, even when model/tools are customized.
    await sdk.updateSession({
      inputAudioFormat: 'pcm16',
      inputAudioSamplingRate: 24_000,
      outputAudioFormat: 'pcm16',
    })
    check(session)
    session.ready = true
    state('listening')
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      listener(signal)
      return () => listeners.delete(listener)
    },
    start() {
      if (starting) return starting
      if (active?.ready) return Promise.resolve()
      if (stopping) return stopping.then(() => this.start())
      const session: ActiveSession<Session> = {
        abort: new AbortController(),
        disposed: false,
        ready: false,
        userSpeaking: false,
        responseComplete: false,
        interruptedResponses: new Set(),
        pendingAudio: 0,
      }
      active = session
      state('connecting')
      let timer: ReturnType<typeof setTimeout>
      const canceled = new Promise<never>((_, reject) => {
        session.abort.signal.addEventListener('abort', () => reject(session.abort.signal.reason), {
          once: true,
        })
        timer = setTimeout(() => {
          const error = new Error('Azure Voice Live startup timed out.')
          fail(session, error)
          reject(error)
        }, config.startTimeoutMs ?? 30_000)
      })
      starting = Promise.race([connect(session), canceled])
        .catch(async (error) => {
          if (current(session)) fail(session, error)
          await cleanup(session).catch(() => undefined)
          throw error
        })
        .finally(() => {
          clearTimeout(timer)
          starting = undefined
        })
      return starting
    },
    stop() {
      if (stopping) return stopping
      const session = active
      stopping = (session ? cleanup(session) : Promise.resolve())
        .then(() => state('idle'))
        .catch((error) => {
          state('error', error)
          throw error
        })
        .finally(() => (stopping = undefined))
      return stopping
    },
  }
}
