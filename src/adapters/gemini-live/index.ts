import type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState } from '../types'
import { calibrateOutputVolume } from '../audio-level'
import type {
  OutputVolumeCalibration,
  OutputVolumeCalibrationSource,
  OutputVolumeSample,
} from '../audio-level'

export interface GeminiLiveInlineData {
  data?: string
  mimeType?: string
}

export interface GeminiLiveServerMessage {
  setupComplete?: unknown
  serverContent?: {
    modelTurn?: {
      parts?: Array<{ inlineData?: GeminiLiveInlineData }>
    }
    turnComplete?: boolean
    generationComplete?: boolean
    interrupted?: boolean
    waitingForInput?: boolean
  }
}

export interface GeminiLiveCallbacks {
  onopen?: () => void
  onmessage: (message: GeminiLiveServerMessage) => void
  onerror?: (error: unknown) => void
  onclose?: (event: unknown) => void
}

export interface GeminiLiveSession {
  sendRealtimeInput(input: {
    audio?: { data: string; mimeType: string }
    audioStreamEnd?: boolean
    activityStart?: Record<string, never>
    activityEnd?: Record<string, never>
  }): void
  close(): void
}

export interface GeminiLiveAdapterConfig {
  /** Connects an official Google GenAI Live session using the supplied callbacks. */
  connect(callbacks: GeminiLiveCallbacks): Promise<GeminiLiveSession>
  /** Defaults to `{ audio: true }`. */
  mediaStreamConstraints?: MediaStreamConstraints
  /** Defaults to 16 kHz PCM input, as recommended by Gemini Live. */
  inputSampleRate?: number
  /** Defaults to 0.04 normalized input volume. */
  speechThreshold?: number
  /** Defaults to 500 ms before listening transitions to thinking. */
  speechEndDelayMs?: number
  /** Defaults to client-side detection. Use `server` with Gemini automatic activity detection. */
  activityDetection?: 'client' | 'server'
  /** Runtime override for tests or custom browser wrappers. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  /** Runtime override for tests or custom browser wrappers. */
  createAudioContext?: () => AudioContext
  /** Optional live-tunable output shaping. A getter is read for every meter sample. */
  outputVolumeCalibration?: OutputVolumeCalibrationSource
  /** Receives raw, shaped, and smoothed output levels for diagnostics. */
  onOutputVolumeSample?: (sample: OutputVolumeSample) => void
}

export interface GeminiLiveOrbAdapter extends OrbAdapter {
  start(): Promise<void>
  stop(): Promise<void>
}

const DEFAULT_INPUT_SAMPLE_RATE = 16_000
const DEFAULT_GEMINI_OUTPUT_CALIBRATION: OutputVolumeCalibration = {
  noiseFloor: 0.003,
  gain: 4,
  exponent: 0.8,
  attack: 0.3,
  release: 0.1,
}

function calculateRms(samples: Float32Array) {
  let sumSquares = 0
  for (const sample of samples) sumSquares += sample * sample
  return Math.sqrt(sumSquares / samples.length)
}

function normalizeInputRms(samples: Float32Array) {
  return Math.min(1, Math.max(0, Math.pow(calculateRms(samples) * 4, 0.8)))
}

function resample(samples: Float32Array, sourceRate: number, targetRate: number) {
  if (sourceRate === targetRate) return samples
  const ratio = sourceRate / targetRate
  const length = Math.max(1, Math.round(samples.length / ratio))
  const result = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const sourceIndex = index * ratio
    const lowerIndex = Math.floor(sourceIndex)
    const upperIndex = Math.min(samples.length - 1, lowerIndex + 1)
    const weight = sourceIndex - lowerIndex
    result[index] = samples[lowerIndex] * (1 - weight) + samples[upperIndex] * weight
  }
  return result
}

function encodePcm16(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function decodePcm16(data: string) {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  const view = new DataView(bytes.buffer)
  const samples = new Float32Array(Math.floor(bytes.length / 2))
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000
  }
  return samples
}

function sampleRateFromMimeType(mimeType: string | undefined) {
  const match = mimeType?.match(/rate=(\d+)/i)
  return match ? Number(match[1]) : 24_000
}

/**
 * Creates a managed browser-audio adapter for Gemini Live. The app owns token
 * creation and the official GenAI client; orb-ui owns microphone streaming,
 * PCM playback, volume metering, and normalized voice state.
 */
export function createGeminiLiveAdapter(config: GeminiLiveAdapterConfig): GeminiLiveOrbAdapter {
  const listeners = new Set<OrbSignalListener>()
  const scheduledSources = new Set<AudioBufferSourceNode>()
  let signal: OrbSignal = { state: 'idle', volume: 0, inputVolume: 0, outputVolume: 0 }
  let session: GeminiLiveSession | null = null
  let stream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let inputSource: MediaStreamAudioSourceNode | null = null
  let inputProcessor: ScriptProcessorNode | null = null
  let silentGain: GainNode | null = null
  let outputAnalyser: AnalyserNode | null = null
  let outputVolumeInterval: ReturnType<typeof setInterval> | null = null
  let speechEndTimer: ReturnType<typeof setTimeout> | null = null
  let userSpeaking = false
  let nextOutputTime = 0
  let outputVolumeLevel = 0
  let turnComplete = false
  let stopping = false

  function usesClientActivityDetection() {
    return config.activityDetection !== 'server'
  }

  function getOutputVolumeCalibration() {
    const overrides =
      typeof config.outputVolumeCalibration === 'function'
        ? config.outputVolumeCalibration()
        : config.outputVolumeCalibration
    return { ...DEFAULT_GEMINI_OUTPUT_CALIBRATION, ...overrides }
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

  function clearSpeechEndTimer() {
    if (!speechEndTimer) return
    clearTimeout(speechEndTimer)
    speechEndTimer = null
  }

  function handleInputVolume(inputVolume: number) {
    const threshold = config.speechThreshold ?? 0.04
    if (inputVolume > threshold) {
      if (!userSpeaking && usesClientActivityDetection()) {
        session?.sendRealtimeInput({ activityStart: {} })
      }
      userSpeaking = true
      clearSpeechEndTimer()
      if (signal.state !== 'listening') emitState('listening')
    } else if (userSpeaking && !speechEndTimer) {
      speechEndTimer = setTimeout(() => {
        speechEndTimer = null
        userSpeaking = false
        if (usesClientActivityDetection()) {
          session?.sendRealtimeInput({ activityEnd: {} })
        }
        if (signal.state === 'listening') emitState('thinking')
      }, config.speechEndDelayMs ?? 500)
    }

    if (signal.state === 'listening') {
      emit({ ...signal, volume: inputVolume, inputVolume, outputVolume: 0 })
    }
  }

  function stopScheduledAudio() {
    scheduledSources.forEach((source) => {
      try {
        source.stop()
      } catch {
        // Source may already have ended.
      }
      source.disconnect()
    })
    scheduledSources.clear()
    nextOutputTime = audioContext?.currentTime ?? 0
  }

  function finishTurnIfReady() {
    if (turnComplete && scheduledSources.size === 0) {
      turnComplete = false
      emitState('listening')
    }
  }

  function scheduleAudio(inlineData: GeminiLiveInlineData) {
    if (!audioContext || !outputAnalyser || !inlineData.data) return
    const samples = decodePcm16(inlineData.data)
    const buffer = audioContext.createBuffer(
      1,
      samples.length,
      sampleRateFromMimeType(inlineData.mimeType),
    )
    buffer.getChannelData(0).set(samples)
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(outputAnalyser)
    const startAt = Math.max(audioContext.currentTime, nextOutputTime)
    nextOutputTime = startAt + buffer.duration
    scheduledSources.add(source)
    source.onended = () => {
      scheduledSources.delete(source)
      source.disconnect()
      finishTurnIfReady()
    }
    source.start(startAt)
    if (signal.state !== 'speaking') emitState('speaking')
  }

  function handleMessage(message: GeminiLiveServerMessage) {
    if (message.setupComplete) emitState('listening')
    const content = message.serverContent
    if (!content) return

    if (content.interrupted) {
      stopScheduledAudio()
      turnComplete = false
      emitState('listening')
      return
    }

    const audioParts = content.modelTurn?.parts?.filter((part) => part.inlineData?.data) ?? []
    if (content.modelTurn && audioParts.length === 0 && signal.state !== 'speaking') {
      emitState('thinking')
    }
    audioParts.forEach((part) => scheduleAudio(part.inlineData!))

    if (content.waitingForInput) {
      stopScheduledAudio()
      emitState('listening')
    }
    if (content.turnComplete || content.generationComplete) {
      turnComplete = true
      finishTurnIfReady()
    }
  }

  function startOutputMeter() {
    if (!outputAnalyser) return
    const samples = new Float32Array(outputAnalyser.fftSize)
    outputVolumeInterval = setInterval(() => {
      if (!outputAnalyser || signal.state !== 'speaking') return
      outputAnalyser.getFloatTimeDomainData(samples)
      const sample = calibrateOutputVolume(
        calculateRms(samples),
        outputVolumeLevel,
        getOutputVolumeCalibration,
      )
      outputVolumeLevel = sample.normalized
      config.onOutputVolumeSample?.(sample)
      const outputVolume = sample.normalized
      emit({ ...signal, volume: outputVolume, inputVolume: 0, outputVolume })
    }, 33)
  }

  function startInputCapture() {
    if (!audioContext || !stream || !session) return
    inputSource = audioContext.createMediaStreamSource(stream)
    inputProcessor = audioContext.createScriptProcessor(4096, 1, 1)
    silentGain = audioContext.createGain()
    silentGain.gain.value = 0
    inputSource.connect(inputProcessor)
    inputProcessor.connect(silentGain)
    silentGain.connect(audioContext.destination)
    inputProcessor.onaudioprocess = (event) => {
      if (!session || stopping) return
      const samples = event.inputBuffer.getChannelData(0)
      handleInputVolume(normalizeInputRms(samples))
      const pcm = resample(
        samples,
        audioContext?.sampleRate ?? DEFAULT_INPUT_SAMPLE_RATE,
        config.inputSampleRate ?? DEFAULT_INPUT_SAMPLE_RATE,
      )
      session.sendRealtimeInput({
        audio: {
          data: encodePcm16(pcm),
          mimeType: `audio/pcm;rate=${config.inputSampleRate ?? DEFAULT_INPUT_SAMPLE_RATE}`,
        },
      })
    }
  }

  async function cleanup(emitIdle: boolean) {
    stopping = true
    clearSpeechEndTimer()
    if (outputVolumeInterval) clearInterval(outputVolumeInterval)
    outputVolumeInterval = null
    stopScheduledAudio()
    inputProcessor?.disconnect()
    inputSource?.disconnect()
    silentGain?.disconnect()
    outputAnalyser?.disconnect()
    inputProcessor = null
    inputSource = null
    silentGain = null
    outputAnalyser = null
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (audioContext && audioContext.state !== 'closed') await audioContext.close()
    audioContext = null
    session = null
    userSpeaking = false
    turnComplete = false
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
      if (session) return
      emitState('connecting')
      stopping = false

      try {
        const getUserMedia =
          config.getUserMedia ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints))
        const createAudioContext = config.createAudioContext ?? (() => new window.AudioContext())
        stream = await getUserMedia(config.mediaStreamConstraints ?? { audio: true })
        audioContext = createAudioContext()
        if (audioContext.state === 'suspended') await audioContext.resume()
        outputAnalyser = audioContext.createAnalyser()
        outputAnalyser.fftSize = 512
        outputAnalyser.smoothingTimeConstant = 0.25
        outputAnalyser.connect(audioContext.destination)
        startOutputMeter()

        session = await config.connect({
          onopen: () => emitState('listening'),
          onmessage: handleMessage,
          onerror: (error) => emitState('error', error),
          onclose: () => {
            if (!stopping) emitState('idle')
          },
        })
        startInputCapture()
        emitState('listening')
      } catch (error) {
        session?.close()
        await cleanup(false)
        emitState('error', error)
        throw error
      }
    },

    async stop() {
      stopping = true
      try {
        if (userSpeaking && usesClientActivityDetection()) {
          session?.sendRealtimeInput({ activityEnd: {} })
        }
        session?.sendRealtimeInput({ audioStreamEnd: true })
      } catch {
        // The session may already be closed.
      }
      session?.close()
      await cleanup(true)
    },
  }
}
