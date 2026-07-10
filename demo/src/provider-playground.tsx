import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { LiveCallbacks, LiveConnectConfig } from '@google/genai'
import { Orb } from 'orb-ui'
import type { OrbAdapter, OrbSignal, OrbState, OrbTheme } from 'orb-ui'
import {
  createElevenLabsAdapter,
  createGeminiLiveAdapter,
  createLiveKitAdapter,
  createOpenAIRealtimeAdapter,
  createPipecatAdapter,
  createVapiAdapter,
} from 'orb-ui/adapters'
import type {
  GeminiLiveSession,
  OutputVolumeCalibration,
  OutputVolumeSample,
} from 'orb-ui/adapters'
import './provider-playground.css'

type ProviderId = 'manual' | 'vapi' | 'elevenlabs' | 'livekit' | 'pipecat' | 'openai' | 'gemini'
type LiveKitConnectionMode = 'sandbox' | 'endpoint' | 'raw'
type PipecatConnectionMode = 'cloud' | 'small-webrtc'
type TunableProviderId = 'openai' | 'gemini'
type OutputCalibrationByProvider = Record<TunableProviderId, OutputVolumeCalibration>

interface ProviderConfig {
  vapiPublicKey: string
  vapiAssistantId: string
  elevenLabsAgentId: string
  liveKitConnectionMode: LiveKitConnectionMode
  liveKitSandboxId: string
  liveKitTokenEndpoint: string
  liveKitAgentName: string
  liveKitRoomPrefix: string
  liveKitServerUrl: string
  liveKitParticipantToken: string
  pipecatConnectionMode: PipecatConnectionMode
  pipecatApiKey: string
  pipecatAgentName: string
  pipecatWebrtcUrl: string
  openAIApiKey: string
  openAIModel: string
  openAIVoice: string
  openAIInstructions: string
  geminiApiKey: string
  geminiModel: string
  geminiVoice: string
  geminiInstructions: string
}

interface EventEntry {
  id: number
  provider: ProviderId
  signal: OrbSignal
  time: string
}

type VapiClient = Parameters<typeof createVapiAdapter>[0]
type VapiConstructor = new (apiToken: string) => VapiClient

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'manual', label: 'Manual Signal' },
  { id: 'vapi', label: 'Vapi' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'livekit', label: 'LiveKit' },
  { id: 'pipecat', label: 'Pipecat' },
  { id: 'openai', label: 'OpenAI Realtime' },
  { id: 'gemini', label: 'Gemini Live' },
]

const LIVEKIT_CONNECTION_MODES: Array<{ id: LiveKitConnectionMode; label: string }> = [
  { id: 'sandbox', label: 'Cloud Sandbox' },
  { id: 'endpoint', label: 'Token Endpoint' },
  { id: 'raw', label: 'Raw Details' },
]

const PIPECAT_CONNECTION_MODES: Array<{ id: PipecatConnectionMode; label: string }> = [
  { id: 'cloud', label: 'Pipecat Cloud' },
  { id: 'small-webrtc', label: 'Self-hosted WebRTC' },
]

const THEMES: OrbTheme[] = ['circle', 'bars', 'debug']
const STATES: OrbState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'error']
const DEFAULT_LIVEKIT_ROOM_PREFIX = 'orb-ui-playground'
const DEFAULT_OPENAI_MODEL = 'gpt-realtime-2.1'
const DEFAULT_OPENAI_VOICE = 'marin'
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-live-preview'
const DEFAULT_GEMINI_VOICE = 'Kore'
const DEFAULT_INSTRUCTIONS =
  'You are a concise, friendly voice assistant helping test a realtime React UI.'

const EMPTY_SIGNAL: OrbSignal = { state: 'idle', volume: 0, inputVolume: 0, outputVolume: 0 }
const CONFIG_STORAGE_KEY = 'orb-ui:provider-playground-config'
const CALIBRATION_STORAGE_KEY = 'orb-ui:provider-playground-output-calibration'
const DEFAULT_OUTPUT_CALIBRATION: OutputCalibrationByProvider = {
  openai: {
    noiseFloor: 0.003,
    gain: 4,
    exponent: 0.8,
    attack: 0.55,
    release: 0.1,
  },
  gemini: {
    noiseFloor: 0.003,
    gain: 4,
    exponent: 0.8,
    attack: 0.3,
    release: 0.1,
  },
}

const OUTPUT_CALIBRATION_CONTROLS: Array<{
  key: keyof OutputVolumeCalibration
  label: string
  min: number
  max: number
  step: number
  digits: number
}> = [
  { key: 'noiseFloor', label: 'Noise floor', min: 0, max: 0.05, step: 0.001, digits: 3 },
  { key: 'gain', label: 'Gain', min: 1, max: 12, step: 0.1, digits: 1 },
  { key: 'exponent', label: 'Curve', min: 0.3, max: 1.5, step: 0.05, digits: 2 },
  { key: 'attack', label: 'Attack', min: 0.05, max: 1, step: 0.05, digits: 2 },
  { key: 'release', label: 'Release', min: 0.02, max: 1, step: 0.02, digits: 2 },
]

function isTunableProvider(provider: ProviderId): provider is TunableProviderId {
  return provider === 'openai' || provider === 'gemini'
}

function copyOutputCalibration(
  calibration: OutputCalibrationByProvider,
): OutputCalibrationByProvider {
  return {
    openai: { ...calibration.openai },
    gemini: { ...calibration.gemini },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isVapiConstructor(value: unknown): value is VapiConstructor {
  return typeof value === 'function'
}

function getVapiConstructor(vapiExport: unknown): VapiConstructor {
  if (isVapiConstructor(vapiExport)) return vapiExport

  if (isRecord(vapiExport)) {
    const defaultExport = vapiExport.default
    if (isVapiConstructor(defaultExport)) return defaultExport

    if (isRecord(defaultExport) && isVapiConstructor(defaultExport.default)) {
      return defaultExport.default
    }
  }

  throw new TypeError('Vapi constructor export was not found.')
}

function normalizeLiveKitConnectionMode(value: unknown): LiveKitConnectionMode {
  if (value === 'endpoint' || value === 'raw' || value === 'sandbox') return value
  return 'sandbox'
}

function normalizePipecatConnectionMode(value: unknown): PipecatConnectionMode {
  return value === 'small-webrtc' ? 'small-webrtc' : 'cloud'
}

function createLiveKitRoomName(prefix: string) {
  const normalizedPrefix = prefix || DEFAULT_LIVEKIT_ROOM_PREFIX
  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `${normalizedPrefix}-${randomId}`
}

function getStorage() {
  if (typeof window === 'undefined') return undefined

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function readStoredOutputCalibration(): OutputCalibrationByProvider {
  const defaults = copyOutputCalibration(DEFAULT_OUTPUT_CALIBRATION)
  const storage = getStorage()
  if (!storage) return defaults

  try {
    const parsed = JSON.parse(storage.getItem(CALIBRATION_STORAGE_KEY) ?? '{}')
    if (!isRecord(parsed)) return defaults

    for (const provider of ['openai', 'gemini'] as const) {
      const storedProvider = parsed[provider]
      if (!isRecord(storedProvider)) continue

      for (const control of OUTPUT_CALIBRATION_CONTROLS) {
        const value = storedProvider[control.key]
        if (typeof value === 'number' && Number.isFinite(value)) {
          defaults[provider][control.key] = value
        }
      }
    }

    return defaults
  } catch {
    return defaults
  }
}

function writeStoredOutputCalibration(calibration: OutputCalibrationByProvider) {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration))
  } catch {
    // Storage can be disabled or full in some browser modes.
  }
}

function readStoredConfig(): Partial<ProviderConfig> {
  const storage = getStorage()
  if (!storage) return {}

  try {
    const parsed = JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? '{}')
    if (!isRecord(parsed)) return {}

    const storedConfig: Partial<ProviderConfig> = {}
    if (typeof parsed.vapiPublicKey === 'string') storedConfig.vapiPublicKey = parsed.vapiPublicKey
    if (typeof parsed.vapiAssistantId === 'string') {
      storedConfig.vapiAssistantId = parsed.vapiAssistantId
    }
    if (typeof parsed.elevenLabsAgentId === 'string') {
      storedConfig.elevenLabsAgentId = parsed.elevenLabsAgentId
    }
    if (typeof parsed.liveKitConnectionMode === 'string') {
      storedConfig.liveKitConnectionMode = normalizeLiveKitConnectionMode(
        parsed.liveKitConnectionMode,
      )
    }
    if (typeof parsed.liveKitSandboxId === 'string') {
      storedConfig.liveKitSandboxId = parsed.liveKitSandboxId
    }
    if (typeof parsed.liveKitTokenEndpoint === 'string') {
      storedConfig.liveKitTokenEndpoint = parsed.liveKitTokenEndpoint
    }
    if (typeof parsed.liveKitAgentName === 'string') {
      storedConfig.liveKitAgentName = parsed.liveKitAgentName
    }
    if (typeof parsed.liveKitRoomPrefix === 'string') {
      storedConfig.liveKitRoomPrefix = parsed.liveKitRoomPrefix
    }
    if (typeof parsed.liveKitServerUrl === 'string') {
      storedConfig.liveKitServerUrl = parsed.liveKitServerUrl
    }
    if (typeof parsed.liveKitParticipantToken === 'string' && parsed.liveKitParticipantToken) {
      storedConfig.liveKitParticipantToken = parsed.liveKitParticipantToken
    } else if (typeof parsed.liveKitToken === 'string' && parsed.liveKitToken) {
      storedConfig.liveKitParticipantToken = parsed.liveKitToken
    }
    if (typeof parsed.pipecatConnectionMode === 'string') {
      storedConfig.pipecatConnectionMode = normalizePipecatConnectionMode(
        parsed.pipecatConnectionMode,
      )
    }
    if (typeof parsed.pipecatAgentName === 'string') {
      storedConfig.pipecatAgentName = parsed.pipecatAgentName
    }
    if (typeof parsed.pipecatWebrtcUrl === 'string') {
      storedConfig.pipecatWebrtcUrl = parsed.pipecatWebrtcUrl
    }
    if (typeof parsed.openAIModel === 'string') storedConfig.openAIModel = parsed.openAIModel
    if (typeof parsed.openAIVoice === 'string') storedConfig.openAIVoice = parsed.openAIVoice
    if (typeof parsed.openAIInstructions === 'string') {
      storedConfig.openAIInstructions = parsed.openAIInstructions
    }
    if (typeof parsed.geminiModel === 'string') storedConfig.geminiModel = parsed.geminiModel
    if (typeof parsed.geminiVoice === 'string') storedConfig.geminiVoice = parsed.geminiVoice
    if (typeof parsed.geminiInstructions === 'string') {
      storedConfig.geminiInstructions = parsed.geminiInstructions
    }

    return storedConfig
  } catch {
    return {}
  }
}

function writeStoredConfig(config: ProviderConfig) {
  const storage = getStorage()
  if (!storage) return

  try {
    const storedConfig: Partial<ProviderConfig> = { ...config }
    delete storedConfig.liveKitParticipantToken
    delete storedConfig.pipecatApiKey
    delete storedConfig.openAIApiKey
    delete storedConfig.geminiApiKey
    storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(storedConfig))
  } catch {
    // Storage can be disabled or full in some browser modes.
  }
}

function readEnvConfig(): ProviderConfig {
  return {
    vapiPublicKey: import.meta.env.VITE_VAPI_PUBLIC_KEY ?? '',
    vapiAssistantId: import.meta.env.VITE_VAPI_ASSISTANT_ID ?? '',
    elevenLabsAgentId: import.meta.env.VITE_ELEVENLABS_AGENT_ID ?? '',
    liveKitConnectionMode: normalizeLiveKitConnectionMode(import.meta.env.VITE_LIVEKIT_MODE),
    liveKitSandboxId: import.meta.env.VITE_LIVEKIT_SANDBOX_ID ?? '',
    liveKitTokenEndpoint: import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT ?? '',
    liveKitAgentName: import.meta.env.VITE_LIVEKIT_AGENT_NAME ?? '',
    liveKitRoomPrefix: import.meta.env.VITE_LIVEKIT_ROOM_PREFIX ?? DEFAULT_LIVEKIT_ROOM_PREFIX,
    liveKitServerUrl: import.meta.env.VITE_LIVEKIT_SERVER_URL ?? '',
    liveKitParticipantToken:
      import.meta.env.VITE_LIVEKIT_PARTICIPANT_TOKEN ?? import.meta.env.VITE_LIVEKIT_TOKEN ?? '',
    pipecatConnectionMode: normalizePipecatConnectionMode(import.meta.env.VITE_PIPECAT_MODE),
    pipecatApiKey: '',
    pipecatAgentName: import.meta.env.VITE_PIPECAT_AGENT_NAME ?? '',
    pipecatWebrtcUrl: import.meta.env.VITE_PIPECAT_WEBRTC_URL ?? '',
    openAIApiKey: '',
    openAIModel: import.meta.env.VITE_OPENAI_REALTIME_MODEL ?? DEFAULT_OPENAI_MODEL,
    openAIVoice: import.meta.env.VITE_OPENAI_REALTIME_VOICE ?? DEFAULT_OPENAI_VOICE,
    openAIInstructions: import.meta.env.VITE_OPENAI_REALTIME_INSTRUCTIONS ?? DEFAULT_INSTRUCTIONS,
    geminiApiKey: '',
    geminiModel: import.meta.env.VITE_GEMINI_LIVE_MODEL ?? DEFAULT_GEMINI_MODEL,
    geminiVoice: import.meta.env.VITE_GEMINI_LIVE_VOICE ?? DEFAULT_GEMINI_VOICE,
    geminiInstructions: import.meta.env.VITE_GEMINI_LIVE_INSTRUCTIONS ?? DEFAULT_INSTRUCTIONS,
  }
}

function readConfig(): ProviderConfig {
  return {
    ...readEnvConfig(),
    ...readStoredConfig(),
  }
}

function normalizeConfig(config: ProviderConfig): ProviderConfig {
  return {
    vapiPublicKey: (config.vapiPublicKey ?? '').trim(),
    vapiAssistantId: (config.vapiAssistantId ?? '').trim(),
    elevenLabsAgentId: (config.elevenLabsAgentId ?? '').trim(),
    liveKitConnectionMode: normalizeLiveKitConnectionMode(config.liveKitConnectionMode),
    liveKitSandboxId: (config.liveKitSandboxId ?? '').trim(),
    liveKitTokenEndpoint: (config.liveKitTokenEndpoint ?? '').trim(),
    liveKitAgentName: (config.liveKitAgentName ?? '').trim(),
    liveKitRoomPrefix: (config.liveKitRoomPrefix ?? '').trim() || DEFAULT_LIVEKIT_ROOM_PREFIX,
    liveKitServerUrl: (config.liveKitServerUrl ?? '').trim(),
    liveKitParticipantToken: (config.liveKitParticipantToken ?? '').trim(),
    pipecatConnectionMode: normalizePipecatConnectionMode(config.pipecatConnectionMode),
    pipecatApiKey: (config.pipecatApiKey ?? '').trim(),
    pipecatAgentName: (config.pipecatAgentName ?? '').trim(),
    pipecatWebrtcUrl: (config.pipecatWebrtcUrl ?? '').trim(),
    openAIApiKey: (config.openAIApiKey ?? '').trim(),
    openAIModel: (config.openAIModel ?? '').trim() || DEFAULT_OPENAI_MODEL,
    openAIVoice: (config.openAIVoice ?? '').trim() || DEFAULT_OPENAI_VOICE,
    openAIInstructions: (config.openAIInstructions ?? '').trim() || DEFAULT_INSTRUCTIONS,
    geminiApiKey: (config.geminiApiKey ?? '').trim(),
    geminiModel: (config.geminiModel ?? '').trim() || DEFAULT_GEMINI_MODEL,
    geminiVoice: (config.geminiVoice ?? '').trim() || DEFAULT_GEMINI_VOICE,
    geminiInstructions: (config.geminiInstructions ?? '').trim() || DEFAULT_INSTRUCTIONS,
  }
}

function formatVolume(value: number | undefined) {
  return (value ?? 0).toFixed(2)
}

function createManualSignal(state: OrbState, inputVolume: number, outputVolume: number): OrbSignal {
  if (state === 'listening') return { state, inputVolume, volume: inputVolume }
  if (state === 'speaking') return { state, outputVolume, volume: outputVolume }
  return { state, volume: 0, inputVolume: 0, outputVolume: 0 }
}

function getProviderReady(provider: ProviderId, config: ProviderConfig) {
  if (provider === 'manual') return true
  if (provider === 'vapi') return Boolean(config.vapiPublicKey && config.vapiAssistantId)
  if (provider === 'elevenlabs') return Boolean(config.elevenLabsAgentId)
  if (provider === 'pipecat') {
    return config.pipecatConnectionMode === 'cloud'
      ? Boolean(config.pipecatApiKey && config.pipecatAgentName)
      : Boolean(config.pipecatWebrtcUrl)
  }
  if (provider === 'openai') return Boolean(config.openAIApiKey)
  if (provider === 'gemini') return Boolean(config.geminiApiKey)
  if (config.liveKitConnectionMode === 'sandbox') {
    return Boolean(config.liveKitSandboxId && config.liveKitAgentName)
  }
  if (config.liveKitConnectionMode === 'endpoint') {
    return Boolean(config.liveKitTokenEndpoint && config.liveKitAgentName)
  }
  return Boolean(config.liveKitServerUrl && config.liveKitParticipantToken)
}

async function postProviderJson<TResponse>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as TResponse & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || `Provider request failed with status ${response.status}.`)
  }
  return payload
}

function createLazyAdapter(factory: () => OrbAdapter | Promise<OrbAdapter>): OrbAdapter {
  let activeAdapter: OrbAdapter | undefined
  let activeAdapterPromise: Promise<OrbAdapter> | undefined
  let adapterGeneration = 0
  let unsubscribeActiveAdapter: (() => void) | undefined
  const listeners = new Set<(signal: OrbSignal) => void>()

  function emit(signal: OrbSignal) {
    listeners.forEach((listener) => listener(signal))
  }

  async function getActiveAdapter() {
    if (activeAdapter) return activeAdapter
    if (!activeAdapterPromise) {
      const generation = adapterGeneration
      activeAdapterPromise = Promise.resolve(factory()).then(async (adapter) => {
        if (generation !== adapterGeneration) {
          await adapter.stop?.()
          throw new Error('[orb-ui/demo] Provider adapter was disposed while loading.')
        }
        activeAdapter = adapter
        unsubscribeActiveAdapter = adapter.subscribe(emit)
        return adapter
      })
      activeAdapterPromise.catch(() => {
        if (generation === adapterGeneration) activeAdapterPromise = undefined
      })
    }
    return activeAdapterPromise
  }

  function disposeActiveAdapter() {
    adapterGeneration += 1
    void activeAdapter?.stop?.()
    unsubscribeActiveAdapter?.()
    activeAdapter = undefined
    activeAdapterPromise = undefined
    unsubscribeActiveAdapter = undefined
  }

  return {
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) disposeActiveAdapter()
      }
    },

    async start() {
      try {
        const adapter = await getActiveAdapter()
        await adapter.start?.()
      } catch (error) {
        console.error('[orb-ui/demo] Provider start failed:', error)
        emit({ state: 'error', volume: 0, inputVolume: 0, outputVolume: 0, error })
      }
    },

    async stop() {
      await activeAdapter?.stop?.()
    },
  }
}

function createProviderAdapter(
  provider: ProviderId,
  config: ProviderConfig,
  outputCalibration?: {
    get: () => OutputVolumeCalibration
    onSample: (sample: OutputVolumeSample) => void
  },
): OrbAdapter | undefined {
  if (provider === 'vapi' && getProviderReady(provider, config)) {
    return createLazyAdapter(async () => {
      const vapiModule = await import('@vapi-ai/web')
      return createVapiAdapter(new (getVapiConstructor(vapiModule.default))(config.vapiPublicKey), {
        assistantId: config.vapiAssistantId,
      })
    })
  }

  if (provider === 'elevenlabs' && getProviderReady(provider, config)) {
    return createLazyAdapter(async () => {
      const { Conversation } = await import('@elevenlabs/client')
      return createElevenLabsAdapter(Conversation, {
        agentId: config.elevenLabsAgentId,
      })
    })
  }

  if (provider === 'pipecat' && getProviderReady(provider, config)) {
    return createLazyAdapter(async () => {
      const { PipecatClient } = await import('@pipecat-ai/client-js')
      const transport =
        config.pipecatConnectionMode === 'cloud'
          ? new (await import('@pipecat-ai/daily-transport')).DailyTransport({
              bufferLocalAudioUntilBotReady: true,
            })
          : new (await import('@pipecat-ai/small-webrtc-transport')).SmallWebRTCTransport()
      const client = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
      })

      return createPipecatAdapter(client, {
        connect:
          config.pipecatConnectionMode === 'cloud'
            ? () =>
                client.startBotAndConnect({
                  endpoint: '/api/pipecat-start',
                  requestData: {
                    apiKey: config.pipecatApiKey,
                    agentName: config.pipecatAgentName,
                  },
                })
            : () => client.connect({ webrtcUrl: config.pipecatWebrtcUrl }),
      })
    })
  }

  if (provider === 'openai' && getProviderReady(provider, config)) {
    return createLazyAdapter(() =>
      createOpenAIRealtimeAdapter({
        outputVolumeCalibration: outputCalibration?.get,
        onOutputVolumeSample: outputCalibration?.onSample,
        getClientSecret: () =>
          postProviderJson<{ value: string }>('/api/openai-realtime-token', {
            apiKey: config.openAIApiKey,
            model: config.openAIModel,
            voice: config.openAIVoice,
            instructions: config.openAIInstructions,
          }),
      }),
    )
  }

  if (provider === 'gemini' && getProviderReady(provider, config)) {
    return createLazyAdapter(() =>
      createGeminiLiveAdapter({
        outputVolumeCalibration: outputCalibration?.get,
        onOutputVolumeSample: outputCalibration?.onSample,
        connect: async (callbacks) => {
          const { GoogleGenAI } = await import('@google/genai')
          const token = await postProviderJson<{
            value: string
            model: string
            config: LiveConnectConfig
          }>('/api/gemini-live-token', {
            apiKey: config.geminiApiKey,
            model: config.geminiModel,
            voice: config.geminiVoice,
            instructions: config.geminiInstructions,
          })
          const client = new GoogleGenAI({
            apiKey: token.value,
            httpOptions: { apiVersion: 'v1alpha' },
          })
          const session = await client.live.connect({
            model: token.model,
            config: token.config,
            callbacks: callbacks as LiveCallbacks,
          })
          return session as unknown as GeminiLiveSession
        },
      }),
    )
  }

  if (provider === 'livekit' && getProviderReady(provider, config)) {
    return createLazyAdapter(async () => {
      if (config.liveKitConnectionMode === 'sandbox') {
        const { createLiveKitAdapter: createManagedLiveKitAdapter } =
          await import('orb-ui/adapters/livekit')
        return createManagedLiveKitAdapter({
          sandboxId: config.liveKitSandboxId,
          agentName: config.liveKitAgentName,
          roomName: () => createLiveKitRoomName(config.liveKitRoomPrefix),
        })
      }

      if (config.liveKitConnectionMode === 'endpoint') {
        const { createLiveKitAdapter: createManagedLiveKitAdapter } =
          await import('orb-ui/adapters/livekit')
        return createManagedLiveKitAdapter({
          tokenEndpoint: config.liveKitTokenEndpoint,
          agentName: config.liveKitAgentName,
          roomName: () => createLiveKitRoomName(config.liveKitRoomPrefix),
        })
      }

      const { Room, createAudioAnalyser } = await import('livekit-client')
      return createLiveKitAdapter({
        serverUrl: config.liveKitServerUrl,
        participantToken: config.liveKitParticipantToken,
        createAudioAnalyser,
        RoomClass: Room,
      })
    })
  }

  return undefined
}

function EnvRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="provider-row">
      <span>{label}</span>
      <span className={`provider-pill ${ready ? 'is-ready' : 'is-missing'}`}>
        {ready ? 'Ready' : 'Missing'}
      </span>
    </div>
  )
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="provider-row">
      <span>{label}</span>
      <span className="provider-status-value">{value}</span>
    </div>
  )
}

function OutputCalibrationControls({
  calibration,
  onChange,
  onReset,
  peakRaw,
  sample,
}: {
  calibration: OutputVolumeCalibration
  onChange: (key: keyof OutputVolumeCalibration, value: number) => void
  onReset: () => void
  peakRaw: number
  sample: OutputVolumeSample | undefined
}) {
  return (
    <section className="provider-panel provider-diagnostics">
      <div className="provider-calibration-heading">
        <span className="provider-label">Live Output Calibration</span>
        <button className="provider-button" onClick={onReset} type="button">
          Reset suggested
        </button>
      </div>
      <p className="provider-note">
        These controls update the active session immediately. Lower attack/release values add more
        smoothing; lower curve values lift quiet audio.
      </p>
      <div className="provider-sliders provider-calibration-sliders">
        {OUTPUT_CALIBRATION_CONTROLS.map((control) => (
          <label className="provider-slider-row" key={control.key}>
            <span>{control.label}</span>
            <input
              data-testid={`output-calibration-${control.key}`}
              max={control.max}
              min={control.min}
              onChange={(event) => onChange(control.key, Number(event.currentTarget.value))}
              step={control.step}
              type="range"
              value={calibration[control.key]}
            />
            <span>{calibration[control.key].toFixed(control.digits)}</span>
          </label>
        ))}
      </div>
      <div className="provider-signal-list">
        <SignalRow label="raw RMS" value={(sample?.raw ?? 0).toFixed(4)} />
        <SignalRow label="peak raw" value={peakRaw.toFixed(4)} />
        <SignalRow label="shaped" value={(sample?.shaped ?? 0).toFixed(3)} />
        <SignalRow label="smoothed" value={(sample?.normalized ?? 0).toFixed(3)} />
      </div>
      <span className="provider-label provider-preset-label">Preset to send back</span>
      <pre className="provider-code" data-testid="output-calibration-preset">
        {JSON.stringify(calibration)}
      </pre>
    </section>
  )
}

function ConfigField({
  id,
  label,
  onChange,
  type = 'text',
  value,
}: {
  id: string
  label: string
  onChange: (value: string) => void
  type?: 'password' | 'text' | 'url'
  value: string
}) {
  return (
    <label className="provider-field" htmlFor={id}>
      <span>{label}</span>
      <input
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        className="provider-input"
        data-testid={id}
        id={id}
        onChange={(event) => onChange(event.currentTarget.value)}
        spellCheck={false}
        type={type}
        value={value}
      />
    </label>
  )
}

type UpdateProviderConfig = <TKey extends keyof ProviderConfig>(
  key: TKey,
  value: ProviderConfig[TKey],
) => void

function ProviderConfigFields({
  config,
  provider,
  updateConfig,
}: {
  config: ProviderConfig
  provider: Exclude<ProviderId, 'manual'>
  updateConfig: UpdateProviderConfig
}) {
  if (provider === 'vapi') {
    return (
      <>
        <ConfigField
          id="config-vapi-public-key"
          label="Vapi public key"
          onChange={(value) => updateConfig('vapiPublicKey', value)}
          type="password"
          value={config.vapiPublicKey}
        />
        <ConfigField
          id="config-vapi-assistant-id"
          label="Vapi assistant ID"
          onChange={(value) => updateConfig('vapiAssistantId', value)}
          value={config.vapiAssistantId}
        />
      </>
    )
  }

  if (provider === 'elevenlabs') {
    return (
      <ConfigField
        id="config-elevenlabs-agent-id"
        label="ElevenLabs agent ID"
        onChange={(value) => updateConfig('elevenLabsAgentId', value)}
        value={config.elevenLabsAgentId}
      />
    )
  }

  if (provider === 'pipecat') {
    return (
      <>
        <div className="provider-control-group">
          <span className="provider-label">Connection</span>
          <div className="provider-segment">
            {PIPECAT_CONNECTION_MODES.map((item) => (
              <button
                className={`provider-button ${
                  config.pipecatConnectionMode === item.id ? 'is-selected' : ''
                }`}
                key={item.id}
                onClick={() => updateConfig('pipecatConnectionMode', item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {config.pipecatConnectionMode === 'cloud' ? (
          <>
            <ConfigField
              id="config-pipecat-api-key"
              label="Pipecat Cloud public API key"
              onChange={(value) => updateConfig('pipecatApiKey', value)}
              type="password"
              value={config.pipecatApiKey}
            />
            <ConfigField
              id="config-pipecat-agent-name"
              label="Deployed agent name"
              onChange={(value) => updateConfig('pipecatAgentName', value)}
              value={config.pipecatAgentName}
            />
          </>
        ) : (
          <ConfigField
            id="config-pipecat-webrtc-url"
            label="SmallWebRTC offer URL"
            onChange={(value) => updateConfig('pipecatWebrtcUrl', value)}
            type="url"
            value={config.pipecatWebrtcUrl}
          />
        )}
        <p className="provider-note">
          Cloud mode expects an already-deployed Pipecat agent. Self-hosted mode expects the
          bot&apos;s public <code>/api/offer</code> endpoint.
        </p>
      </>
    )
  }

  if (provider === 'openai') {
    return (
      <>
        <ConfigField
          id="config-openai-api-key"
          label="OpenAI API key"
          onChange={(value) => updateConfig('openAIApiKey', value)}
          type="password"
          value={config.openAIApiKey}
        />
        <ConfigField
          id="config-openai-model"
          label="Realtime model"
          onChange={(value) => updateConfig('openAIModel', value)}
          value={config.openAIModel}
        />
        <ConfigField
          id="config-openai-voice"
          label="Voice"
          onChange={(value) => updateConfig('openAIVoice', value)}
          value={config.openAIVoice}
        />
        <ConfigField
          id="config-openai-instructions"
          label="Instructions"
          onChange={(value) => updateConfig('openAIInstructions', value)}
          value={config.openAIInstructions}
        />
        <p className="provider-note">
          The standard key is held in memory only and exchanged for a short-lived Realtime client
          secret through this deployment.
        </p>
      </>
    )
  }

  if (provider === 'gemini') {
    return (
      <>
        <ConfigField
          id="config-gemini-api-key"
          label="Gemini API key"
          onChange={(value) => updateConfig('geminiApiKey', value)}
          type="password"
          value={config.geminiApiKey}
        />
        <ConfigField
          id="config-gemini-model"
          label="Live model"
          onChange={(value) => updateConfig('geminiModel', value)}
          value={config.geminiModel}
        />
        <ConfigField
          id="config-gemini-voice"
          label="Voice"
          onChange={(value) => updateConfig('geminiVoice', value)}
          value={config.geminiVoice}
        />
        <ConfigField
          id="config-gemini-instructions"
          label="Instructions"
          onChange={(value) => updateConfig('geminiInstructions', value)}
          value={config.geminiInstructions}
        />
        <p className="provider-note">
          The standard key is held in memory only and exchanged for a one-use Gemini Live token
          through this deployment.
        </p>
      </>
    )
  }

  return (
    <>
      <div className="provider-control-group">
        <span className="provider-label">Connection</span>
        <div className="provider-segment">
          {LIVEKIT_CONNECTION_MODES.map((item) => (
            <button
              className={`provider-button ${
                config.liveKitConnectionMode === item.id ? 'is-selected' : ''
              }`}
              key={item.id}
              onClick={() => updateConfig('liveKitConnectionMode', item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {config.liveKitConnectionMode === 'sandbox' ? (
        <ConfigField
          id="config-livekit-sandbox-id"
          label="Sandbox token server ID"
          onChange={(value) => updateConfig('liveKitSandboxId', value)}
          value={config.liveKitSandboxId}
        />
      ) : null}

      {config.liveKitConnectionMode === 'endpoint' ? (
        <ConfigField
          id="config-livekit-token-endpoint"
          label="Token endpoint URL"
          onChange={(value) => updateConfig('liveKitTokenEndpoint', value)}
          type="url"
          value={config.liveKitTokenEndpoint}
        />
      ) : null}

      {config.liveKitConnectionMode === 'raw' ? (
        <>
          <ConfigField
            id="config-livekit-server-url"
            label="LiveKit server URL"
            onChange={(value) => updateConfig('liveKitServerUrl', value)}
            type="url"
            value={config.liveKitServerUrl}
          />
          <ConfigField
            id="config-livekit-participant-token"
            label="Participant token"
            onChange={(value) => updateConfig('liveKitParticipantToken', value)}
            type="password"
            value={config.liveKitParticipantToken}
          />
        </>
      ) : (
        <>
          <ConfigField
            id="config-livekit-agent-name"
            label="Agent name"
            onChange={(value) => updateConfig('liveKitAgentName', value)}
            value={config.liveKitAgentName}
          />
          <ConfigField
            id="config-livekit-room-prefix"
            label="Room prefix"
            onChange={(value) => updateConfig('liveKitRoomPrefix', value)}
            value={config.liveKitRoomPrefix}
          />
        </>
      )}
    </>
  )
}

function ProviderReadinessRows({
  config,
  provider,
}: {
  config: ProviderConfig
  provider: Exclude<ProviderId, 'manual'>
}) {
  if (provider === 'vapi') {
    return (
      <>
        <EnvRow label="Vapi public key" ready={Boolean(config.vapiPublicKey)} />
        <EnvRow label="Vapi assistant ID" ready={Boolean(config.vapiAssistantId)} />
      </>
    )
  }
  if (provider === 'elevenlabs') {
    return <EnvRow label="ElevenLabs agent ID" ready={Boolean(config.elevenLabsAgentId)} />
  }
  if (provider === 'pipecat') {
    return config.pipecatConnectionMode === 'cloud' ? (
      <>
        <EnvRow label="Cloud public key" ready={Boolean(config.pipecatApiKey)} />
        <EnvRow label="Deployed agent name" ready={Boolean(config.pipecatAgentName)} />
      </>
    ) : (
      <EnvRow label="SmallWebRTC offer URL" ready={Boolean(config.pipecatWebrtcUrl)} />
    )
  }
  if (provider === 'openai') {
    return (
      <>
        <EnvRow label="OpenAI API key" ready={Boolean(config.openAIApiKey)} />
        <EnvRow label="Realtime model" ready={Boolean(config.openAIModel)} />
      </>
    )
  }
  if (provider === 'gemini') {
    return (
      <>
        <EnvRow label="Gemini API key" ready={Boolean(config.geminiApiKey)} />
        <EnvRow label="Live model" ready={Boolean(config.geminiModel)} />
      </>
    )
  }

  return (
    <>
      <EnvRow label="Connection mode" ready={Boolean(config.liveKitConnectionMode)} />
      {config.liveKitConnectionMode === 'sandbox' ? (
        <EnvRow label="Sandbox token server ID" ready={Boolean(config.liveKitSandboxId)} />
      ) : null}
      {config.liveKitConnectionMode === 'endpoint' ? (
        <EnvRow label="Token endpoint URL" ready={Boolean(config.liveKitTokenEndpoint)} />
      ) : null}
      {config.liveKitConnectionMode !== 'raw' ? (
        <>
          <EnvRow label="Agent name" ready={Boolean(config.liveKitAgentName)} />
          <EnvRow label="Room prefix" ready={Boolean(config.liveKitRoomPrefix)} />
        </>
      ) : null}
      {config.liveKitConnectionMode === 'raw' ? (
        <>
          <EnvRow label="LiveKit server URL" ready={Boolean(config.liveKitServerUrl)} />
          <EnvRow label="Participant token" ready={Boolean(config.liveKitParticipantToken)} />
        </>
      ) : null}
    </>
  )
}

function ProviderPlayground() {
  const [config, setConfig] = useState<ProviderConfig>(() => readConfig())
  const [provider, setProvider] = useState<ProviderId>('manual')
  const [theme, setTheme] = useState<OrbTheme>('circle')
  const [manualState, setManualState] = useState<OrbState>('idle')
  const [manualInputVolume, setManualInputVolume] = useState(0.35)
  const [manualOutputVolume, setManualOutputVolume] = useState(0.65)
  const [latestSignal, setLatestSignal] = useState<OrbSignal>(EMPTY_SIGNAL)
  const [events, setEvents] = useState<EventEntry[]>([])
  const [outputCalibration, setOutputCalibration] = useState<OutputCalibrationByProvider>(() =>
    readStoredOutputCalibration(),
  )
  const outputCalibrationRef = useRef(outputCalibration)
  const [latestOutputSample, setLatestOutputSample] = useState<OutputVolumeSample>()
  const [peakRawOutput, setPeakRawOutput] = useState(0)

  useEffect(() => {
    writeStoredConfig(config)
  }, [config])

  useEffect(() => {
    outputCalibrationRef.current = outputCalibration
    writeStoredOutputCalibration(outputCalibration)
  }, [outputCalibration])

  const getActiveOutputCalibration = useCallback(() => {
    if (!isTunableProvider(provider)) return DEFAULT_OUTPUT_CALIBRATION.openai
    return outputCalibrationRef.current[provider]
  }, [provider])

  const recordOutputSample = useCallback((sample: OutputVolumeSample) => {
    setLatestOutputSample(sample)
    setPeakRawOutput((current) => Math.max(current, sample.raw))
  }, [])

  const activeConfig = useMemo(() => normalizeConfig(config), [config])
  const providerReady = getProviderReady(provider, activeConfig)
  const providerAdapter = useMemo(
    () =>
      createProviderAdapter(
        provider,
        activeConfig,
        isTunableProvider(provider)
          ? { get: getActiveOutputCalibration, onSample: recordOutputSample }
          : undefined,
      ),
    [activeConfig, getActiveOutputCalibration, provider, recordOutputSample],
  )

  const updateConfig = useCallback(function updateConfig<TKey extends keyof ProviderConfig>(
    key: TKey,
    value: ProviderConfig[TKey],
  ) {
    setConfig((current) => ({ ...current, [key]: value }))
  }, [])

  const resetProviderConfig = useCallback(() => {
    const defaultConfig = readEnvConfig()

    setConfig((current) => {
      if (provider === 'vapi') {
        return {
          ...current,
          vapiPublicKey: defaultConfig.vapiPublicKey,
          vapiAssistantId: defaultConfig.vapiAssistantId,
        }
      }

      if (provider === 'elevenlabs') {
        return { ...current, elevenLabsAgentId: defaultConfig.elevenLabsAgentId }
      }

      if (provider === 'livekit') {
        return {
          ...current,
          liveKitConnectionMode: defaultConfig.liveKitConnectionMode,
          liveKitSandboxId: defaultConfig.liveKitSandboxId,
          liveKitTokenEndpoint: defaultConfig.liveKitTokenEndpoint,
          liveKitAgentName: defaultConfig.liveKitAgentName,
          liveKitRoomPrefix: defaultConfig.liveKitRoomPrefix,
          liveKitServerUrl: defaultConfig.liveKitServerUrl,
          liveKitParticipantToken: defaultConfig.liveKitParticipantToken,
        }
      }

      if (provider === 'pipecat') {
        return {
          ...current,
          pipecatConnectionMode: defaultConfig.pipecatConnectionMode,
          pipecatApiKey: '',
          pipecatAgentName: defaultConfig.pipecatAgentName,
          pipecatWebrtcUrl: defaultConfig.pipecatWebrtcUrl,
        }
      }

      if (provider === 'openai') {
        return {
          ...current,
          openAIApiKey: '',
          openAIModel: defaultConfig.openAIModel,
          openAIVoice: defaultConfig.openAIVoice,
          openAIInstructions: defaultConfig.openAIInstructions,
        }
      }

      if (provider === 'gemini') {
        return {
          ...current,
          geminiApiKey: '',
          geminiModel: defaultConfig.geminiModel,
          geminiVoice: defaultConfig.geminiVoice,
          geminiInstructions: defaultConfig.geminiInstructions,
        }
      }

      return current
    })
  }, [provider])

  const clearProviderConfig = useCallback(() => {
    setConfig((current) => {
      if (provider === 'vapi') {
        return { ...current, vapiPublicKey: '', vapiAssistantId: '' }
      }

      if (provider === 'elevenlabs') {
        return { ...current, elevenLabsAgentId: '' }
      }

      if (provider === 'livekit') {
        return {
          ...current,
          liveKitSandboxId: '',
          liveKitTokenEndpoint: '',
          liveKitAgentName: '',
          liveKitRoomPrefix: DEFAULT_LIVEKIT_ROOM_PREFIX,
          liveKitServerUrl: '',
          liveKitParticipantToken: '',
        }
      }

      if (provider === 'pipecat') {
        return {
          ...current,
          pipecatApiKey: '',
          pipecatAgentName: '',
          pipecatWebrtcUrl: '',
        }
      }

      if (provider === 'openai') {
        return {
          ...current,
          openAIApiKey: '',
          openAIModel: DEFAULT_OPENAI_MODEL,
          openAIVoice: DEFAULT_OPENAI_VOICE,
          openAIInstructions: DEFAULT_INSTRUCTIONS,
        }
      }

      if (provider === 'gemini') {
        return {
          ...current,
          geminiApiKey: '',
          geminiModel: DEFAULT_GEMINI_MODEL,
          geminiVoice: DEFAULT_GEMINI_VOICE,
          geminiInstructions: DEFAULT_INSTRUCTIONS,
        }
      }

      return current
    })
  }, [provider])

  const recordSignal = useCallback((nextProvider: ProviderId, signal: OrbSignal) => {
    setLatestSignal(signal)
    setEvents((current) => [
      {
        id: Date.now() + Math.random(),
        provider: nextProvider,
        signal,
        time: new Date().toLocaleTimeString(),
      },
      ...current.slice(0, 11),
    ])
  }, [])

  const monitoredAdapter = useMemo<OrbAdapter | undefined>(() => {
    if (!providerAdapter) return undefined

    return {
      subscribe(listener) {
        return providerAdapter.subscribe((signal) => {
          recordSignal(provider, signal)
          listener(signal)
        })
      },
      start: providerAdapter.start ? () => providerAdapter.start?.() : undefined,
      stop: providerAdapter.stop ? () => providerAdapter.stop?.() : undefined,
    }
  }, [provider, providerAdapter, recordSignal])

  const manualSignal = useMemo(
    () => createManualSignal(manualState, manualInputVolume, manualOutputVolume),
    [manualInputVolume, manualOutputVolume, manualState],
  )

  useEffect(() => {
    setLatestSignal(EMPTY_SIGNAL)
    setEvents([])
    setLatestOutputSample(undefined)
    setPeakRawOutput(0)
  }, [provider])

  const updateOutputCalibration = useCallback(
    (key: keyof OutputVolumeCalibration, value: number) => {
      if (!isTunableProvider(provider)) return
      setOutputCalibration((current) => {
        const next = {
          ...current,
          [provider]: { ...current[provider], [key]: value },
        }
        outputCalibrationRef.current = next
        return next
      })
    },
    [provider],
  )

  const resetOutputCalibration = useCallback(() => {
    if (!isTunableProvider(provider)) return
    setOutputCalibration((current) => {
      const next = {
        ...current,
        [provider]: { ...DEFAULT_OUTPUT_CALIBRATION[provider] },
      }
      outputCalibrationRef.current = next
      return next
    })
    setLatestOutputSample(undefined)
    setPeakRawOutput(0)
  }, [provider])

  const displayedSignal = provider === 'manual' ? manualSignal : latestSignal
  const activeState = provider === 'manual' ? manualSignal.state : latestSignal.state
  const activeVolume =
    provider === 'manual'
      ? manualSignal.volume
      : activeState === 'listening'
        ? (latestSignal.inputVolume ?? latestSignal.volume)
        : activeState === 'speaking'
          ? (latestSignal.outputVolume ?? latestSignal.volume)
          : latestSignal.volume

  const updateManualState = useCallback(
    (state: OrbState) => {
      const signal = createManualSignal(state, manualInputVolume, manualOutputVolume)
      setManualState(state)
      recordSignal('manual', signal)
    },
    [manualInputVolume, manualOutputVolume, recordSignal],
  )

  const updateManualInputVolume = useCallback(
    (inputVolume: number) => {
      const signal = createManualSignal(manualState, inputVolume, manualOutputVolume)
      setManualInputVolume(inputVolume)
      recordSignal('manual', signal)
    },
    [manualOutputVolume, manualState, recordSignal],
  )

  const updateManualOutputVolume = useCallback(
    (outputVolume: number) => {
      const signal = createManualSignal(manualState, manualInputVolume, outputVolume)
      setManualOutputVolume(outputVolume)
      recordSignal('manual', signal)
    },
    [manualInputVolume, manualState, recordSignal],
  )

  return (
    <main className="provider-page">
      <div className="provider-shell">
        <header className="provider-header">
          <div>
            <h1 className="provider-title">Provider QA Playground</h1>
            <p className="provider-subtitle">
              Adapter bench for comparing real signal behavior across providers.
            </p>
          </div>
          <a className="provider-link" href="/">
            Public demo
          </a>
        </header>

        <div className="provider-layout">
          <section className="provider-panel provider-stage" aria-label="Provider test surface">
            <div className="provider-toolbar">
              <div className="provider-control-group">
                <span className="provider-label">Provider</span>
                <div className="provider-segment">
                  {PROVIDERS.map((item) => (
                    <button
                      className={`provider-button ${provider === item.id ? 'is-selected' : ''}`}
                      key={item.id}
                      onClick={() => setProvider(item.id)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="provider-control-group">
                <span className="provider-label">Theme</span>
                <div className="provider-segment">
                  {THEMES.map((item) => (
                    <button
                      className={`provider-button ${theme === item ? 'is-selected' : ''}`}
                      key={item}
                      onClick={() => setTheme(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="provider-orb-zone">
              {provider === 'manual' ? (
                <Orb
                  aria-label="Manual signal orb"
                  data-testid="provider-playground-orb"
                  signal={manualSignal}
                  size={280}
                  theme={theme}
                />
              ) : (
                <Orb
                  adapter={monitoredAdapter}
                  aria-label={`Start ${provider} session`}
                  data-testid="provider-playground-orb"
                  disabled={!providerReady}
                  size={280}
                  theme={theme}
                />
              )}
            </div>

            <div className="provider-status-strip">
              <div className="provider-status-item">
                <span className="provider-status-label">Provider</span>
                <span className="provider-status-value" data-testid="qa-provider">
                  {provider}
                </span>
              </div>
              <div className="provider-status-item">
                <span className="provider-status-label">State</span>
                <span className="provider-status-value" data-testid="qa-state">
                  {activeState}
                </span>
              </div>
              <div className="provider-status-item">
                <span className="provider-status-label">Input</span>
                <span className="provider-status-value" data-testid="qa-input-volume">
                  {formatVolume(displayedSignal.inputVolume)}
                </span>
              </div>
              <div className="provider-status-item">
                <span className="provider-status-label">Output</span>
                <span className="provider-status-value" data-testid="qa-output-volume">
                  {formatVolume(displayedSignal.outputVolume)}
                </span>
              </div>
            </div>

            {provider === 'manual' ? (
              <div className="provider-controls">
                <div className="provider-control-group">
                  <span className="provider-label">Manual Signal</span>
                  <div className="provider-segment">
                    {STATES.map((item) => (
                      <button
                        className={`provider-button ${manualState === item ? 'is-selected' : ''}`}
                        key={item}
                        onClick={() => updateManualState(item)}
                        type="button"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="provider-control-group provider-sliders">
                  <label className="provider-slider-row">
                    <span>Input</span>
                    <input
                      max={1}
                      min={0}
                      onChange={(event) =>
                        updateManualInputVolume(Number(event.currentTarget.value))
                      }
                      step={0.01}
                      type="range"
                      value={manualInputVolume}
                    />
                    <span>{manualInputVolume.toFixed(2)}</span>
                  </label>
                  <label className="provider-slider-row">
                    <span>Output</span>
                    <input
                      max={1}
                      min={0}
                      onChange={(event) =>
                        updateManualOutputVolume(Number(event.currentTarget.value))
                      }
                      step={0.01}
                      type="range"
                      value={manualOutputVolume}
                    />
                    <span>{manualOutputVolume.toFixed(2)}</span>
                  </label>
                </div>

                <div className="provider-control-group">
                  <span className="provider-label">Active Volume</span>
                  <pre className="provider-code">{formatVolume(activeVolume)}</pre>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="provider-sidebar" aria-label="Provider diagnostics">
            {provider !== 'manual' ? (
              <section className="provider-panel provider-diagnostics">
                <span className="provider-label">
                  {PROVIDERS.find((item) => item.id === provider)?.label} Config
                </span>
                <div className="provider-field-list">
                  <ProviderConfigFields
                    config={config}
                    provider={provider}
                    updateConfig={updateConfig}
                  />
                </div>
                <div className="provider-config-actions">
                  <button className="provider-button" onClick={resetProviderConfig} type="button">
                    Use env defaults
                  </button>
                  <button className="provider-button" onClick={clearProviderConfig} type="button">
                    Clear
                  </button>
                </div>
                <div className="provider-env-list">
                  <ProviderReadinessRows config={activeConfig} provider={provider} />
                </div>
              </section>
            ) : null}

            {isTunableProvider(provider) ? (
              <OutputCalibrationControls
                calibration={outputCalibration[provider]}
                onChange={updateOutputCalibration}
                onReset={resetOutputCalibration}
                peakRaw={peakRawOutput}
                sample={latestOutputSample}
              />
            ) : null}

            <section className="provider-panel provider-diagnostics">
              <span className="provider-label">Latest Signal</span>
              <div className="provider-signal-list">
                <SignalRow label="state" value={displayedSignal.state} />
                <SignalRow label="volume" value={formatVolume(displayedSignal.volume)} />
                <SignalRow label="inputVolume" value={formatVolume(displayedSignal.inputVolume)} />
                <SignalRow
                  label="outputVolume"
                  value={formatVolume(displayedSignal.outputVolume)}
                />
              </div>
              <pre className="provider-code">{JSON.stringify(displayedSignal, null, 2)}</pre>
            </section>

            <section className="provider-panel provider-diagnostics">
              <span className="provider-label">Signal Events</span>
              <div className="provider-event-list">
                {events.length === 0 ? (
                  <div className="provider-event">
                    <div className="provider-event-body">No signal events yet.</div>
                  </div>
                ) : (
                  events.map((event) => (
                    <div className="provider-event" key={event.id}>
                      <div className="provider-event-time">
                        {event.time} / {event.provider}
                      </div>
                      <div className="provider-event-body">{JSON.stringify(event.signal)}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProviderPlayground />
  </StrictMode>,
)
