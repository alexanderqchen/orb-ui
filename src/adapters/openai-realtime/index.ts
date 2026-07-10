import type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState } from '../types'
import { calibrateOutputVolume } from '../audio-level'
import type {
  OutputVolumeCalibration,
  OutputVolumeCalibrationSource,
  OutputVolumeSample,
} from '../audio-level'

export interface OpenAIRealtimeClientSecret {
  value: string
}

export interface OpenAIRealtimeAdapterConfig {
  /** Fetch a newly minted Realtime client secret for every session start. */
  getClientSecret(): Promise<string | OpenAIRealtimeClientSecret>
  /** Defaults to OpenAI's GA WebRTC calls endpoint. */
  callsUrl?: string
  /** Defaults to `{ audio: true }`. */
  mediaStreamConstraints?: MediaStreamConstraints
  /** Runtime override for tests, React Native shims, or custom browser wrappers. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  /** Runtime override for custom WebRTC implementations. */
  createPeerConnection?: () => RTCPeerConnection
  /** Runtime override for custom fetch implementations. */
  fetch?: typeof fetch
  /** Runtime override for custom audio element ownership. */
  createAudioElement?: () => HTMLAudioElement
  /** Return undefined to disable browser-side volume metering. */
  createAudioContext?: () => AudioContext | undefined
  /** Optional live-tunable output shaping. A getter is read for every meter sample. */
  outputVolumeCalibration?: OutputVolumeCalibrationSource
  /** Receives raw, shaped, and smoothed output levels for diagnostics. */
  onOutputVolumeSample?: (sample: OutputVolumeSample) => void
}

export interface OpenAIRealtimeOrbAdapter extends OrbAdapter {
  start(): Promise<void>
  stop(): Promise<void>
}

interface RealtimeServerEvent {
  type?: string
  error?: unknown
}

interface VolumeMeter {
  stop(): Promise<void>
}

const DEFAULT_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'
const OUTPUT_SPEECH_THRESHOLD = 0.015
const OUTPUT_SILENCE_TICKS = 8
const DEFAULT_OPENAI_OUTPUT_CALIBRATION: OutputVolumeCalibration = {
  noiseFloor: 0.003,
  gain: 4,
  exponent: 0.8,
  attack: 0.55,
  release: 0.1,
}

function defaultCreateAudioContext() {
  const AudioContextClass = window.AudioContext
  return AudioContextClass ? new AudioContextClass() : undefined
}

function normalizeInputRms(rms: number) {
  return Math.min(1, Math.max(0, Math.pow(rms * 4, 0.8)))
}

function createStreamVolumeMeter(
  stream: MediaStream,
  createAudioContext: () => AudioContext | undefined,
  onVolume: (volume: number) => void,
): VolumeMeter | undefined {
  try {
    const context = createAudioContext()
    if (!context) return undefined
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.25
    source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    const interval = setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      let sumSquares = 0
      for (const sample of samples) sumSquares += sample * sample
      onVolume(Math.sqrt(sumSquares / samples.length))
    }, 33)

    return {
      async stop() {
        clearInterval(interval)
        source.disconnect()
        analyser.disconnect()
        if (context.state !== 'closed') await context.close()
      },
    }
  } catch {
    return undefined
  }
}

function resolveClientSecret(secret: string | OpenAIRealtimeClientSecret) {
  const value = typeof secret === 'string' ? secret : secret.value
  if (!value) throw new Error('[orb-ui/openai-realtime] getClientSecret returned an empty value.')
  return value
}

/**
 * Creates a managed browser WebRTC adapter for the OpenAI Realtime API.
 * Standard API keys stay on the app's server; the adapter only receives a
 * short-lived client secret.
 */
export function createOpenAIRealtimeAdapter(
  config: OpenAIRealtimeAdapterConfig,
): OpenAIRealtimeOrbAdapter {
  const listeners = new Set<OrbSignalListener>()
  let signal: OrbSignal = { state: 'idle', volume: 0, inputVolume: 0, outputVolume: 0 }
  let peerConnection: RTCPeerConnection | null = null
  let dataChannel: RTCDataChannel | null = null
  let localStream: MediaStream | null = null
  let remoteAudio: HTMLAudioElement | null = null
  let inputMeter: VolumeMeter | undefined
  let outputMeter: VolumeMeter | undefined
  let outputSilenceTicks = 0
  let outputVolumeLevel = 0
  let stopping = false

  function getOutputVolumeCalibration() {
    const overrides =
      typeof config.outputVolumeCalibration === 'function'
        ? config.outputVolumeCalibration()
        : config.outputVolumeCalibration
    return { ...DEFAULT_OPENAI_OUTPUT_CALIBRATION, ...overrides }
  }

  function emit(next: OrbSignal) {
    signal = next
    listeners.forEach((listener) => listener(next))
  }

  function emitState(state: OrbState, error?: unknown) {
    if (signal.state === state && error === undefined) return
    if (state !== 'speaking') outputVolumeLevel = 0
    emit({
      state,
      volume: 0,
      inputVolume: 0,
      outputVolume: 0,
      ...(error === undefined ? {} : { error }),
    })
  }

  function emitInputVolume(rawInputVolume: number) {
    if (signal.state !== 'listening') return
    const inputVolume = normalizeInputRms(rawInputVolume)
    emit({ ...signal, volume: inputVolume, inputVolume, outputVolume: 0 })
  }

  function emitOutputVolume(rawOutputVolume: number) {
    const sample = calibrateOutputVolume(
      rawOutputVolume,
      outputVolumeLevel,
      getOutputVolumeCalibration,
    )
    outputVolumeLevel = sample.normalized
    config.onOutputVolumeSample?.(sample)
    const outputVolume = sample.normalized

    if (outputVolume > OUTPUT_SPEECH_THRESHOLD) {
      outputSilenceTicks = 0
      if (signal.state !== 'speaking') emitState('speaking')
    } else if (signal.state === 'speaking') {
      outputSilenceTicks += 1
      if (outputSilenceTicks >= OUTPUT_SILENCE_TICKS) {
        outputSilenceTicks = 0
        emitState('listening')
        return
      }
    }

    if (signal.state === 'speaking') {
      emit({ ...signal, volume: outputVolume, inputVolume: 0, outputVolume })
    }
  }

  function handleServerEvent(event: RealtimeServerEvent) {
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        emitState('listening')
        break
      case 'input_audio_buffer.speech_started':
        emitState('listening')
        break
      case 'input_audio_buffer.speech_stopped':
      case 'response.created':
        emitState('thinking')
        break
      case 'response.output_audio.delta':
      case 'output_audio_buffer.started':
        emitState('speaking')
        break
      case 'output_audio_buffer.stopped':
        emitState('listening')
        break
      case 'response.done':
      case 'response.cancelled':
        if (signal.state !== 'speaking') emitState('listening')
        break
      case 'error':
        emitState('error', event.error ?? event)
        break
    }
  }

  async function cleanup(emitIdle: boolean) {
    stopping = true
    dataChannel?.close()
    dataChannel = null
    peerConnection?.close()
    peerConnection = null
    localStream?.getTracks().forEach((track) => track.stop())
    localStream = null
    remoteAudio?.pause()
    if (remoteAudio) remoteAudio.srcObject = null
    remoteAudio?.remove()
    remoteAudio = null
    await Promise.all([inputMeter?.stop(), outputMeter?.stop()])
    inputMeter = undefined
    outputMeter = undefined
    outputSilenceTicks = 0
    outputVolumeLevel = 0
    if (emitIdle) emitState('idle')
    stopping = false
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      listener(signal)
      return () => listeners.delete(listener)
    },

    async start() {
      if (peerConnection) return
      emitState('connecting')
      stopping = false

      try {
        const getUserMedia =
          config.getUserMedia ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints))
        const createPeerConnection = config.createPeerConnection ?? (() => new RTCPeerConnection())
        const fetchImplementation = config.fetch ?? fetch
        const createAudioElement = config.createAudioElement ?? (() => new Audio())
        const createAudioContext = config.createAudioContext ?? defaultCreateAudioContext
        const clientSecret = resolveClientSecret(await config.getClientSecret())

        localStream = await getUserMedia(config.mediaStreamConstraints ?? { audio: true })
        inputMeter = createStreamVolumeMeter(localStream, createAudioContext, emitInputVolume)
        const pc = createPeerConnection()
        peerConnection = pc

        localStream.getAudioTracks().forEach((track) => pc.addTrack(track, localStream!))
        remoteAudio = createAudioElement()
        remoteAudio.autoplay = true

        pc.ontrack = (event) => {
          const stream = event.streams[0] ?? new MediaStream([event.track])
          if (remoteAudio) remoteAudio.srcObject = stream
          void remoteAudio?.play().catch(() => undefined)
          void outputMeter?.stop()
          outputMeter = createStreamVolumeMeter(stream, createAudioContext, emitOutputVolume)
        }
        pc.onconnectionstatechange = () => {
          if (stopping) return
          if (pc.connectionState === 'failed') {
            emitState('error', new Error('[orb-ui/openai-realtime] WebRTC connection failed.'))
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
            emitState('idle')
          }
        }

        const channel = pc.createDataChannel('oai-events')
        dataChannel = channel
        channel.onopen = () => emitState('listening')
        channel.onmessage = (message) => {
          try {
            handleServerEvent(JSON.parse(String(message.data)) as RealtimeServerEvent)
          } catch {
            // Ignore non-JSON messages. Realtime server events are JSON today.
          }
        }
        channel.onerror = (error) => emitState('error', error)
        channel.onclose = () => {
          if (!stopping) emitState('idle')
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        const response = await fetchImplementation(config.callsUrl ?? DEFAULT_CALLS_URL, {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            'Content-Type': 'application/sdp',
          },
        })
        if (!response.ok) {
          const detail = await response.text()
          throw new Error(
            `[orb-ui/openai-realtime] Session negotiation failed (${response.status}): ${detail}`,
          )
        }
        await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() })
      } catch (error) {
        await cleanup(false)
        emitState('error', error)
        throw error
      }
    },

    async stop() {
      await cleanup(true)
    },
  }
}
