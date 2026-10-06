import type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState } from '../types'
import { createVolumeNormalizer, type VolumeCalibrationSource } from '../audio-level'
import {
  createPcmBrowserAudio,
  decodeBase64,
  encodeBase64,
  type PcmBrowserAudio,
  type PcmBrowserAudioOptions,
} from '../azure-voice-live/browser-audio'

export type CartesiaAgentAudioFormat = 'pcm_16000' | 'pcm_24000' | 'pcm_44100'

/** Managed Agent protocol 2026-08-14. Preserve conversation/tool events for application UI. */
export interface CartesiaAgentEvent {
  type: string
  audio?: string | { input_format: string; output_delivery: string }
  call_id?: string
  agent_id?: string
  agent_version_id?: string
  role?: 'user' | 'assistant'
  turn?: number
  text?: string
  interrupted?: boolean
  tool_call_id?: string
  tool_name?: string
  parameters?: Record<string, unknown>
  expects_response?: boolean
  fatal?: boolean
  code?: string
  message?: string
}

export interface CartesiaAdapterConfig extends PcmBrowserAudioOptions {
  agentId: string
  /** Fetch a fresh short-lived agent access token from your own backend on every start. */
  getAccessToken(signal: AbortSignal): Promise<string>
  inputFormat?: CartesiaAgentAudioFormat
  /** speaking_pace works with agent background audio. as_available requires your own buffer. */
  outputDelivery?: 'speaking_pace' | 'as_available'
  apiVersion?: string
  startTimeoutMs?: number
  createWebSocket?: (url: string) => WebSocket
  onEvent?: (event: CartesiaAgentEvent) => void
  /** Recoverable protocol errors keep the connection alive and are delivered here. */
  onRecoverableError?: (event: CartesiaAgentEvent) => void
  inputVolumeCalibration?: VolumeCalibrationSource
  outputVolumeCalibration?: VolumeCalibrationSource
}

export interface CartesiaOrbAdapter extends OrbAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  readonly callId: string | undefined
  sendToolResult(toolCallId: string, result: string, isError?: boolean): void
}

interface Session {
  abort: AbortController
  socket?: WebSocket
  audio?: PcmBrowserAudio
  disposed: boolean
  ready: boolean
  userSpeaking: boolean
  outputComplete: boolean
  callId?: string
  readyResolve?: () => void
  readyReject?: (error: unknown) => void
}

const PCM_CALIBRATION = {
  amplitude: { silenceFloor: 0.003, speechReference: 0.1, speechPeak: 0.3 },
  envelope: { riseTimeMs: 100, fallTimeMs: 400 },
}

/** Managed Agents voice conversation over a native browser socket, with local PCM audio. */
export function createCartesiaAdapter(config: CartesiaAdapterConfig): CartesiaOrbAdapter {
  if (!config.agentId.trim()) throw new Error('A Cartesia Managed Agent ID is required.')
  const inputFormat = config.inputFormat ?? 'pcm_24000'
  const sampleRate = Number(inputFormat.slice(4))
  if (![16_000, 24_000, 44_100].includes(sampleRate)) {
    throw new Error('Cartesia adapter requires a supported mono PCM16 format.')
  }
  const listeners = new Set<OrbSignalListener>()
  let signal: OrbSignal = { state: 'idle', inputVolume: 0, outputVolume: 0 }
  let active: Session | undefined
  let starting: Promise<void> | undefined
  let stopping: Promise<void> | undefined
  let callId: string | undefined
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

  function current(session: Session) {
    return active === session && !session.disposed && !session.abort.signal.aborted
  }

  function check(session: Session) {
    if (!current(session)) throw new DOMException('Cartesia session canceled.', 'AbortError')
  }

  async function cleanup(session: Session, reason?: unknown) {
    if (session.disposed) return
    session.disposed = true
    const canceled = reason ?? new DOMException('Cartesia session canceled.', 'AbortError')
    session.abort.abort(canceled)
    session.readyReject?.(canceled)
    if (active === session) active = undefined
    if (session.socket) {
      session.socket.onopen = null
      session.socket.onmessage = null
      session.socket.onclose = null
      session.socket.onerror = null
      if (session.socket.readyState < 2) session.socket.close(1000, 'session completed')
    }
    await session.audio?.close()
  }

  function fail(session: Session, error: unknown) {
    if (!current(session)) return
    state('error', error)
    session.readyReject?.(error)
    void cleanup(session, error).catch(() => undefined)
  }

  function finishOutput(session: Session) {
    if (session.audio?.hasOutput) return
    output.reset()
    emit({
      ...signal,
      state: session.userSpeaking || session.outputComplete ? 'listening' : 'thinking',
      outputVolume: 0,
    })
  }

  function send(session: Session, event: object) {
    if (!current(session) || session.socket?.readyState !== 1) {
      throw new Error('Cartesia session is not connected.')
    }
    if (session.socket.bufferedAmount > 128 * 1024) {
      throw new Error('Cartesia microphone transport is falling behind.')
    }
    const data = JSON.stringify(event)
    if (new TextEncoder().encode(data).byteLength > 32 * 1024) {
      throw new Error('Cartesia JSON event exceeds 32 KiB.')
    }
    session.socket.send(data)
  }

  function handle(session: Session, event: CartesiaAgentEvent) {
    if (!current(session)) return
    if (event.type === 'session_ready') {
      if (
        typeof event.call_id !== 'string' ||
        typeof event.audio !== 'object' ||
        event.audio.input_format !== inputFormat ||
        event.audio.output_delivery !== (config.outputDelivery ?? 'speaking_pace')
      ) {
        throw new Error('Cartesia session_ready did not confirm the requested audio format.')
      }
      if (session.ready) throw new Error('Duplicate Cartesia session_ready.')
      callId = session.callId = event.call_id
      session.ready = true
      state('listening')
      session.readyResolve?.()
    } else if (event.type === 'error') {
      if (event.fatal !== false) throw new Error(event.message ?? 'Cartesia session failed.')
      config.onRecoverableError?.(event)
    } else {
      if (!session.ready) throw new Error('Cartesia event arrived before session_ready.')
      if (event.type === 'turn_started') {
        session.outputComplete = false
        if (event.role === 'user') {
          session.userSpeaking = true
          session.audio?.clear()
          output.reset()
          emit({ ...signal, state: 'listening', outputVolume: 0 })
        } else if (event.role === 'assistant') {
          if (!session.userSpeaking && !session.audio?.hasOutput) state('thinking')
        }
      } else if (event.type === 'turn_ended') {
        if (event.role === 'user') {
          session.userSpeaking = false
          state('thinking')
        } else if (event.role === 'assistant') {
          session.outputComplete = true
          if (event.interrupted) session.audio?.clear()
          finishOutput(session)
        }
      } else if (event.type === 'audio_output') {
        if (typeof event.audio !== 'string')
          throw new Error('Cartesia audio_output needs base64 PCM.')
        if (!session.userSpeaking) session.audio?.play(decodeBase64(event.audio))
      } else if (event.type === 'audio_output_clear') {
        session.userSpeaking = true
        session.outputComplete = false
        session.audio?.clear()
        output.reset()
        emit({ ...signal, state: 'listening', outputVolume: 0 })
      }
    }
    config.onEvent?.(event)
  }

  async function connect(session: Session) {
    session.audio = createPcmBrowserAudio({
      ...config,
      inputSampleRate: sampleRate,
      outputSampleRate: sampleRate,
      onInput(bytes, rms) {
        if (!current(session)) return
        emit({ ...signal, inputVolume: input.sample(rms).normalized })
        if (!session.ready) return
        try {
          send(session, { type: 'audio_input', audio: encodeBase64(bytes) })
        } catch (error) {
          fail(session, error)
        }
      },
      onOutputVolume(rms) {
        if (current(session)) emit({ ...signal, outputVolume: output.sample(rms).normalized })
      },
      onPlayback(playing) {
        if (!current(session)) return
        if (playing && !session.userSpeaking) state('speaking')
        if (!playing) finishOutput(session)
      },
      onError(error) {
        fail(session, error)
      },
    })
    // Permission errors must happen before a billed Managed Agent connection opens.
    await session.audio.open()
    check(session)
    const token = await config.getAccessToken(session.abort.signal)
    check(session)
    if (!token.trim()) throw new Error('An agent access token is required.')
    const url = new URL(
      `wss://api.cartesia.ai/v1/agents/websocket/${encodeURIComponent(config.agentId)}`,
    )
    url.searchParams.set('cartesia_version', config.apiVersion ?? '2026-08-14')
    url.searchParams.set('access_token', token)
    const socket = (config.createWebSocket ?? ((address) => new WebSocket(address)))(url.toString())
    session.socket = socket
    await new Promise<void>((resolve, reject) => {
      session.readyResolve = resolve
      session.readyReject = reject
      socket.onopen = () => {
        if (!current(session)) return
        try {
          send(session, {
            type: 'session_create',
            audio: {
              input_format: inputFormat,
              output_delivery: config.outputDelivery ?? 'speaking_pace',
            },
          })
        } catch (error) {
          fail(session, error)
        }
      }
      socket.onmessage = ({ data }) => {
        if (!current(session)) return
        try {
          if (typeof data !== 'string') throw new Error('Cartesia requires JSON text frames.')
          const event: unknown = JSON.parse(data)
          if (
            !event ||
            typeof event !== 'object' ||
            !('type' in event) ||
            typeof event.type !== 'string'
          ) {
            throw new Error('Invalid Cartesia event.')
          }
          handle(session, event as CartesiaAgentEvent)
        } catch (error) {
          fail(session, error)
        }
      }
      socket.onerror = () => fail(session, new Error('Cartesia WebSocket connection failed.'))
      socket.onclose = ({ code, reason }) => {
        if (!current(session)) return
        if (!session.ready || code !== 1000) {
          fail(session, new Error(`Cartesia session closed (${code}): ${reason}`))
        } else {
          state('idle')
          void cleanup(session).catch(() => undefined)
        }
      }
    })
    check(session)
  }

  return {
    get callId() {
      return callId
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(signal)
      return () => listeners.delete(listener)
    },
    start() {
      if (starting) return starting
      if (active?.ready) return Promise.resolve()
      if (stopping) return stopping.then(() => this.start())
      const session: Session = {
        abort: new AbortController(),
        disposed: false,
        ready: false,
        userSpeaking: false,
        outputComplete: false,
      }
      active = session
      callId = undefined
      state('connecting')
      let timer: ReturnType<typeof setTimeout>
      const canceled = new Promise<never>((_, reject) => {
        session.abort.signal.addEventListener('abort', () => reject(session.abort.signal.reason), {
          once: true,
        })
        timer = setTimeout(() => {
          const error = new Error('Cartesia startup timed out before session_ready.')
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
    sendToolResult(toolCallId, result, isError = false) {
      if (!active?.ready) throw new Error('Cartesia session is not ready.')
      if (new TextEncoder().encode(result).byteLength > 4096) {
        throw new Error('Cartesia client tool result exceeds 4096 bytes.')
      }
      send(active, {
        type: 'client_tool_result',
        tool_call_id: toolCallId,
        result,
        is_error: isError,
      })
    },
  }
}
