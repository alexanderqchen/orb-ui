import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { LiveCallbacks, LiveConnectConfig } from '@google/genai'
import { Orb } from 'orb-ui'
import type {
  OrbAdapter,
  OrbSignal,
  OrbState,
  OrbTheme,
  OrbThemeName,
  OrbThemePreset,
  OrbThemeRenderer,
} from 'orb-ui'
import {
  createElevenLabsAdapter,
  createGeminiLiveAdapter,
  createLiveKitAdapter,
  createOpenAIRealtimeAdapter,
  createPipecatAdapter,
  createVapiAdapter,
  fitVolumeCalibration,
  PROVIDER_VOLUME_CALIBRATIONS,
} from 'orb-ui/adapters'
import type {
  DirectionalVolumeCalibration,
  GeminiLiveSession,
  VolumeCalibration,
  VolumeCalibrationCapture,
  VolumeCalibrationFit,
  VolumeSample,
} from 'orb-ui/adapters'
import './provider-playground.css'

type ProviderId = 'manual' | 'vapi' | 'elevenlabs' | 'livekit' | 'pipecat' | 'openai' | 'gemini'
type LiveKitConnectionMode = 'sandbox' | 'endpoint' | 'raw'
type PipecatConnectionMode = 'cloud' | 'small-webrtc'
type CalibratableProviderId = Exclude<ProviderId, 'manual'>
type VolumeDirection = 'input' | 'output'
type CalibrationPhase = keyof VolumeCalibrationCapture
type CalibrationByProvider = Record<CalibratableProviderId, DirectionalVolumeCalibration>
type ThemeMode = 'preset' | 'customized' | 'renderer'

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

const THEMES: OrbThemeName[] = ['radial', 'cloud', 'circle', 'bars', 'debug']
const THEME_PRESETS: OrbThemePreset[] = ['balanced', 'calm', 'expressive']
const THEME_MODES: Array<{ id: ThemeMode; label: string }> = [
  { id: 'preset', label: 'Preset' },
  { id: 'customized', label: 'Styled' },
  { id: 'renderer', label: 'Custom renderer' },
]
const STATES: OrbState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'error']
const DEFAULT_LIVEKIT_ROOM_PREFIX = 'orb-ui-playground'
const DEFAULT_OPENAI_MODEL = 'gpt-realtime-2.1'
const DEFAULT_OPENAI_VOICE = 'marin'
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-live-preview'
const DEFAULT_GEMINI_VOICE = 'Kore'
const DEFAULT_INSTRUCTIONS =
  'You are a concise, friendly voice assistant helping test a realtime React UI.'

const EMPTY_SIGNAL: OrbSignal = { state: 'idle', inputVolume: 0, outputVolume: 0 }
const CONFIG_STORAGE_KEY = 'orb-ui:provider-playground-config'
const CALIBRATION_STORAGE_KEY = 'orb-ui:provider-playground-volume-calibration-v2'
const CALIBRATABLE_PROVIDERS: CalibratableProviderId[] = [
  'vapi',
  'elevenlabs',
  'livekit',
  'pipecat',
  'openai',
  'gemini',
]
const CALIBRATION_PHASES: Array<{
  id: CalibrationPhase
  label: string
  instruction: string
}> = [
  { id: 'silence', label: '1. Silence', instruction: 'Pause without speaking.' },
  { id: 'quiet', label: '2. Quiet', instruction: 'Speak softly at a natural distance.' },
  { id: 'normal', label: '3. Normal', instruction: 'Speak at your normal conversational level.' },
  { id: 'energetic', label: '4. Energetic', instruction: 'Speak energetically without shouting.' },
]
const EMPTY_CAPTURE: VolumeCalibrationCapture = {
  silence: [],
  quiet: [],
  normal: [],
  energetic: [],
}

function customizedTheme(name: OrbThemeName, preset: OrbThemePreset): OrbTheme {
  switch (name) {
    case 'circle':
      return {
        name,
        preset,
        appearance: {
          colors: { listening: '#60a5fa', speaking: '#f472b6', thinking: '#c084fc' },
          listeningGlow: 18,
          speakingGlow: 42,
        },
        geometry: { diameterRatio: 0.68, speakingMaxScale: 1.12 },
      }
    case 'bars':
      return {
        name,
        preset,
        appearance: {
          colors: { listening: '#38bdf8', speaking: '#fb7185', thinking: '#a78bfa' },
        },
        geometry: { barWidthRatio: 0.065, gapRatio: 0.026, maxHeightRatio: 0.66 },
      }
    case 'cloud':
      return {
        name,
        preset,
        appearance: {
          deepColor: '#312e81',
          upperColor: '#7c3aed',
          lowerColor: '#f0abfc',
          highlightColor: '#fdf4ff',
          launchColor: '#8b5cf6',
          spinnerColor: '#d8b4fe',
        },
        geometry: { diameterRatio: 0.64, speakingMaxScale: 1.28 },
      }
    case 'radial':
      return {
        name,
        preset,
        appearance: {
          deepColor: '#2e1065',
          cobaltColor: '#7e22ce',
          aquaColor: '#f472b6',
          paleColor: '#fdf2f8',
          membraneColor: '#d8b4fe',
          seamColor: '#ffffff',
          activeControlColor: '#db2777',
        },
        geometry: { diameterRatio: 0.72, controlRatio: 0.18 },
      }
    case 'debug':
    default:
      return {
        name: 'debug',
        preset,
        appearance: {
          colors: { listening: '#38bdf8', speaking: '#fb7185' },
          backgroundColor: '#18111f',
          textColor: '#f5e9ff',
          borderColor: '#6b397f',
        },
        geometry: { borderRadius: 18, padding: 18 },
      }
  }
}

const renderPlaygroundTheme: OrbThemeRenderer = ({ activity, controlProps, rootProps, state }) => {
  const color = state === 'speaking' ? '#f472b6' : state === 'listening' ? '#38bdf8' : '#a78bfa'
  return (
    <div
      {...rootProps}
      style={{
        ...rootProps.style,
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
      }}
    >
      <button
        {...controlProps}
        style={{
          ...controlProps.style,
          width: '72%',
          height: '72%',
          display: 'grid',
          placeItems: 'center',
          appearance: 'none',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '34% 66% 58% 42% / 48% 38% 62% 52%',
          background: `radial-gradient(circle at 34% 28%, #fff 0%, ${color} 24%, #20103f 76%)`,
          boxShadow: `0 20px 70px color-mix(in srgb, ${color} 55%, transparent)`,
          cursor: controlProps.disabled ? 'default' : 'pointer',
          opacity: 1,
          transform: `scale(${0.82 + activity * 0.18}) rotate(${activity * 18}deg)`,
          transition: 'background 240ms ease, border-radius 360ms ease, transform 120ms ease',
        }}
      >
        <span
          style={{
            color: '#fff',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {state} · {activity.toFixed(2)}
        </span>
      </button>
    </div>
  )
}

function isCalibratableProvider(provider: ProviderId): provider is CalibratableProviderId {
  return provider !== 'manual'
}

function supportsDirection(provider: CalibratableProviderId, direction: VolumeDirection) {
  return direction === 'output' || provider !== 'vapi'
}

function copyCalibration(calibration: VolumeCalibration): VolumeCalibration {
  return {
    amplitude: { ...calibration.amplitude },
    envelope: { ...calibration.envelope },
  }
}

function copyDirectionalCalibration(
  calibration: DirectionalVolumeCalibration,
): DirectionalVolumeCalibration {
  return {
    input: calibration.input ? copyCalibration(calibration.input) : undefined,
    output: calibration.output ? copyCalibration(calibration.output) : undefined,
  }
}

function copyProviderCalibrations(): CalibrationByProvider {
  return {
    vapi: copyDirectionalCalibration(PROVIDER_VOLUME_CALIBRATIONS.vapi),
    elevenlabs: copyDirectionalCalibration(PROVIDER_VOLUME_CALIBRATIONS.elevenlabs),
    livekit: copyDirectionalCalibration(PROVIDER_VOLUME_CALIBRATIONS.livekit),
    pipecat: copyDirectionalCalibration(PROVIDER_VOLUME_CALIBRATIONS.pipecat),
    openai: copyDirectionalCalibration(PROVIDER_VOLUME_CALIBRATIONS.openai),
    gemini: copyDirectionalCalibration(PROVIDER_VOLUME_CALIBRATIONS.gemini),
  }
}

function copyCapture(capture: VolumeCalibrationCapture): VolumeCalibrationCapture {
  return {
    silence: [...capture.silence],
    quiet: [...capture.quiet],
    normal: [...capture.normal],
    energetic: [...capture.energetic],
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

function normalizeProvider(value: unknown): ProviderId {
  return PROVIDERS.some((provider) => provider.id === value) ? (value as ProviderId) : 'manual'
}

function normalizeTheme(value: unknown): OrbThemeName {
  return THEMES.includes(value as OrbThemeName) ? (value as OrbThemeName) : 'circle'
}

function normalizeThemePreset(value: unknown): OrbThemePreset {
  return THEME_PRESETS.includes(value as OrbThemePreset) ? (value as OrbThemePreset) : 'balanced'
}

function normalizeThemeMode(value: unknown): ThemeMode {
  return THEME_MODES.some((mode) => mode.id === value) ? (value as ThemeMode) : 'preset'
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

function readCalibration(value: unknown): VolumeCalibration | undefined {
  if (!isRecord(value) || !isRecord(value.amplitude) || !isRecord(value.envelope)) {
    return undefined
  }

  const { silenceFloor, speechReference, speechPeak } = value.amplitude
  const { riseTimeMs, fallTimeMs } = value.envelope
  if (
    typeof silenceFloor !== 'number' ||
    typeof speechReference !== 'number' ||
    typeof speechPeak !== 'number' ||
    typeof riseTimeMs !== 'number' ||
    typeof fallTimeMs !== 'number'
  ) {
    return undefined
  }

  return {
    amplitude: { silenceFloor, speechReference, speechPeak },
    envelope: { riseTimeMs, fallTimeMs },
  }
}

function readStoredCalibration(): CalibrationByProvider {
  const defaults = copyProviderCalibrations()
  const storage = getStorage()
  if (!storage) return defaults

  try {
    const parsed = JSON.parse(storage.getItem(CALIBRATION_STORAGE_KEY) ?? '{}')
    if (!isRecord(parsed)) return defaults

    for (const provider of CALIBRATABLE_PROVIDERS) {
      const storedProvider = parsed[provider]
      if (!isRecord(storedProvider)) continue

      for (const direction of ['input', 'output'] as const) {
        const calibration = readCalibration(storedProvider[direction])
        if (calibration && supportsDirection(provider, direction)) {
          defaults[provider][direction] = calibration
        }
      }
    }

    return defaults
  } catch {
    return defaults
  }
}

function writeStoredCalibration(calibration: CalibrationByProvider) {
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
    if (typeof parsed.liveKitParticipantToken === 'string') {
      storedConfig.liveKitParticipantToken = parsed.liveKitParticipantToken
    } else if (typeof parsed.liveKitToken === 'string') {
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
    if (typeof parsed.pipecatApiKey === 'string') {
      storedConfig.pipecatApiKey = parsed.pipecatApiKey
    }
    if (typeof parsed.pipecatWebrtcUrl === 'string') {
      storedConfig.pipecatWebrtcUrl = parsed.pipecatWebrtcUrl
    }
    if (typeof parsed.openAIApiKey === 'string') storedConfig.openAIApiKey = parsed.openAIApiKey
    if (typeof parsed.openAIModel === 'string') storedConfig.openAIModel = parsed.openAIModel
    if (typeof parsed.openAIVoice === 'string') storedConfig.openAIVoice = parsed.openAIVoice
    if (typeof parsed.openAIInstructions === 'string') {
      storedConfig.openAIInstructions = parsed.openAIInstructions
    }
    if (typeof parsed.geminiApiKey === 'string') storedConfig.geminiApiKey = parsed.geminiApiKey
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

function readStoredSelection(): {
  provider: ProviderId
  theme: OrbThemeName
  themePreset: OrbThemePreset
  themeMode: ThemeMode
} {
  const storage = getStorage()
  if (!storage) {
    return { provider: 'manual', theme: 'circle', themePreset: 'balanced', themeMode: 'preset' }
  }

  try {
    const parsed = JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? '{}')
    if (!isRecord(parsed)) {
      return { provider: 'manual', theme: 'circle', themePreset: 'balanced', themeMode: 'preset' }
    }

    return {
      provider: normalizeProvider(parsed.provider),
      theme: normalizeTheme(parsed.theme),
      themePreset: normalizeThemePreset(parsed.themePreset),
      themeMode: normalizeThemeMode(parsed.themeMode),
    }
  } catch {
    return { provider: 'manual', theme: 'circle', themePreset: 'balanced', themeMode: 'preset' }
  }
}

function writeStoredConfig(
  config: ProviderConfig,
  provider: ProviderId,
  theme: OrbThemeName,
  themePreset: OrbThemePreset,
  themeMode: ThemeMode,
) {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(
      CONFIG_STORAGE_KEY,
      JSON.stringify({ ...config, provider, theme, themePreset, themeMode }),
    )
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
  if (state === 'listening') return { state, inputVolume }
  if (state === 'speaking') return { state, outputVolume }
  return { state, inputVolume: 0, outputVolume: 0 }
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
        emit({ state: 'error', inputVolume: 0, outputVolume: 0, error })
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
  volumeCalibration?: {
    getInput: () => VolumeCalibration
    getOutput: () => VolumeCalibration
    onInputSample: (sample: VolumeSample) => void
    onOutputSample: (sample: VolumeSample) => void
  },
): OrbAdapter | undefined {
  if (provider === 'vapi' && getProviderReady(provider, config)) {
    return createLazyAdapter(async () => {
      const vapiModule = await import('@vapi-ai/web')
      return createVapiAdapter(new (getVapiConstructor(vapiModule.default))(config.vapiPublicKey), {
        assistantId: config.vapiAssistantId,
        outputVolumeCalibration: volumeCalibration?.getOutput,
        onOutputVolumeSample: volumeCalibration?.onOutputSample,
      })
    })
  }

  if (provider === 'elevenlabs' && getProviderReady(provider, config)) {
    return createLazyAdapter(async () => {
      const { Conversation } = await import('@elevenlabs/client')
      return createElevenLabsAdapter(Conversation, {
        agentId: config.elevenLabsAgentId,
        inputVolumeCalibration: volumeCalibration?.getInput,
        outputVolumeCalibration: volumeCalibration?.getOutput,
        onInputVolumeSample: volumeCalibration?.onInputSample,
        onOutputVolumeSample: volumeCalibration?.onOutputSample,
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
        inputVolumeCalibration: volumeCalibration?.getInput,
        outputVolumeCalibration: volumeCalibration?.getOutput,
        onInputVolumeSample: volumeCalibration?.onInputSample,
        onOutputVolumeSample: volumeCalibration?.onOutputSample,
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
        inputVolumeCalibration: volumeCalibration?.getInput,
        outputVolumeCalibration: volumeCalibration?.getOutput,
        onInputVolumeSample: volumeCalibration?.onInputSample,
        onOutputVolumeSample: volumeCalibration?.onOutputSample,
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
        inputVolumeCalibration: volumeCalibration?.getInput,
        outputVolumeCalibration: volumeCalibration?.getOutput,
        onInputVolumeSample: volumeCalibration?.onInputSample,
        onOutputVolumeSample: volumeCalibration?.onOutputSample,
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
          inputVolumeCalibration: volumeCalibration?.getInput,
          outputVolumeCalibration: volumeCalibration?.getOutput,
          onInputVolumeSample: volumeCalibration?.onInputSample,
          onOutputVolumeSample: volumeCalibration?.onOutputSample,
        })
      }

      if (config.liveKitConnectionMode === 'endpoint') {
        const { createLiveKitAdapter: createManagedLiveKitAdapter } =
          await import('orb-ui/adapters/livekit')
        return createManagedLiveKitAdapter({
          tokenEndpoint: config.liveKitTokenEndpoint,
          agentName: config.liveKitAgentName,
          roomName: () => createLiveKitRoomName(config.liveKitRoomPrefix),
          inputVolumeCalibration: volumeCalibration?.getInput,
          outputVolumeCalibration: volumeCalibration?.getOutput,
          onInputVolumeSample: volumeCalibration?.onInputSample,
          onOutputVolumeSample: volumeCalibration?.onOutputSample,
        })
      }

      const { Room, createAudioAnalyser } = await import('livekit-client')
      return createLiveKitAdapter({
        serverUrl: config.liveKitServerUrl,
        participantToken: config.liveKitParticipantToken,
        createAudioAnalyser,
        RoomClass: Room,
        inputVolumeCalibration: volumeCalibration?.getInput,
        outputVolumeCalibration: volumeCalibration?.getOutput,
        onInputVolumeSample: volumeCalibration?.onInputSample,
        onOutputVolumeSample: volumeCalibration?.onOutputSample,
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

function GuidedCalibrationControls({
  provider,
  direction,
  onDirectionChange,
  capture,
  activePhase,
  onTogglePhase,
  onGenerate,
  onReset,
  calibration,
  sample,
  fit,
}: {
  provider: CalibratableProviderId
  direction: VolumeDirection
  onDirectionChange: (direction: VolumeDirection) => void
  capture: VolumeCalibrationCapture
  activePhase: CalibrationPhase | undefined
  onTogglePhase: (phase: CalibrationPhase) => void
  onGenerate: () => void
  onReset: () => void
  calibration: VolumeCalibration
  sample: VolumeSample | undefined
  fit: VolumeCalibrationFit | undefined
}) {
  const readyToGenerate = CALIBRATION_PHASES.every(({ id }) => capture[id].length > 0)

  return (
    <section className="provider-panel provider-diagnostics">
      <div className="provider-calibration-heading">
        <span className="provider-label">Guided Volume Calibration</span>
        <button className="provider-button" onClick={onReset} type="button">
          Reset shipped
        </button>
      </div>
      <p className="provider-note">
        Start the provider session, capture all four speaking conditions, then generate a profile.
        The active session uses the generated values immediately.
      </p>
      <div className="provider-control-group">
        <span className="provider-label">Direction</span>
        <div className="provider-segment">
          {(['input', 'output'] as const).map((item) => (
            <button
              className={`provider-button ${direction === item ? 'is-selected' : ''}`}
              disabled={!supportsDirection(provider, item)}
              key={item}
              onClick={() => onDirectionChange(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="provider-calibration-phases">
        {CALIBRATION_PHASES.map((phase) => (
          <button
            className={`provider-calibration-phase ${activePhase === phase.id ? 'is-recording' : ''}`}
            key={phase.id}
            onClick={() => onTogglePhase(phase.id)}
            type="button"
          >
            <span>{phase.label}</span>
            <strong>{capture[phase.id].length} samples</strong>
            <small>{phase.instruction}</small>
          </button>
        ))}
      </div>
      <button
        className="provider-button"
        disabled={!readyToGenerate || activePhase !== undefined}
        onClick={onGenerate}
        type="button"
      >
        Generate {direction} profile
      </button>
      <div className="provider-signal-list">
        <SignalRow label="raw" value={(sample?.raw ?? 0).toFixed(4)} />
        <SignalRow label="mapped" value={(sample?.mapped ?? 0).toFixed(3)} />
        <SignalRow label="normalized" value={(sample?.normalized ?? 0).toFixed(3)} />
        {fit ? (
          <SignalRow
            label="mapped medians"
            value={`${fit.metrics.quietMedian.toFixed(2)} / ${fit.metrics.normalMedian.toFixed(2)} / ${fit.metrics.energeticMedian.toFixed(2)}`}
          />
        ) : null}
      </div>
      <span className="provider-label provider-preset-label">Generated provider profile</span>
      <pre className="provider-code" data-testid="volume-calibration-profile">
        {JSON.stringify(calibration, null, 2)}
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
          The standard key is exchanged for a short-lived Realtime client secret through this
          deployment.
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
          The standard key is exchanged for a one-use Gemini Live token through this deployment.
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
  const [storedSelection] = useState(() => readStoredSelection())
  const [provider, setProvider] = useState<ProviderId>(storedSelection.provider)
  const [theme, setTheme] = useState<OrbThemeName>(storedSelection.theme)
  const [themePreset, setThemePreset] = useState<OrbThemePreset>(storedSelection.themePreset)
  const [themeMode, setThemeMode] = useState<ThemeMode>(storedSelection.themeMode)
  const [manualState, setManualState] = useState<OrbState>('idle')
  const [manualInputVolume, setManualInputVolume] = useState(0.35)
  const [manualOutputVolume, setManualOutputVolume] = useState(0.65)
  const [latestSignal, setLatestSignal] = useState<OrbSignal>(EMPTY_SIGNAL)
  const [events, setEvents] = useState<EventEntry[]>([])
  const [calibration, setCalibration] = useState<CalibrationByProvider>(() =>
    readStoredCalibration(),
  )
  const calibrationRef = useRef(calibration)
  const [calibrationDirection, setCalibrationDirection] = useState<VolumeDirection>('input')
  const [captures, setCaptures] = useState<Record<VolumeDirection, VolumeCalibrationCapture>>({
    input: copyCapture(EMPTY_CAPTURE),
    output: copyCapture(EMPTY_CAPTURE),
  })
  const [activeCapture, setActiveCapture] = useState<
    { direction: VolumeDirection; phase: CalibrationPhase } | undefined
  >()
  const activeCaptureRef = useRef(activeCapture)
  const [latestSamples, setLatestSamples] = useState<
    Partial<Record<VolumeDirection, VolumeSample>>
  >({})
  const [lastFit, setLastFit] = useState<
    | { provider: CalibratableProviderId; direction: VolumeDirection; fit: VolumeCalibrationFit }
    | undefined
  >()

  useEffect(() => {
    writeStoredConfig(config, provider, theme, themePreset, themeMode)
  }, [config, provider, theme, themeMode, themePreset])

  useEffect(() => {
    calibrationRef.current = calibration
    writeStoredCalibration(calibration)
  }, [calibration])

  useEffect(() => {
    if (activeCapture?.phase !== 'silence') return

    // Some SDKs stop emitting meter callbacks when a direction is silent. A
    // periodic zero records that absence as silence while real raw callbacks
    // still determine the high-percentile floor.
    const interval = window.setInterval(() => {
      setCaptures((current) => ({
        ...current,
        [activeCapture.direction]: {
          ...current[activeCapture.direction],
          silence: [...current[activeCapture.direction].silence, 0].slice(-5000),
        },
      }))
    }, 100)

    return () => window.clearInterval(interval)
  }, [activeCapture])

  const getActiveCalibration = useCallback(
    (direction: VolumeDirection) => {
      if (!isCalibratableProvider(provider)) {
        return copyCalibration(PROVIDER_VOLUME_CALIBRATIONS.openai[direction])
      }
      const current = calibrationRef.current[provider][direction]
      return current ?? copyCalibration(PROVIDER_VOLUME_CALIBRATIONS.openai[direction])
    },
    [provider],
  )

  const recordVolumeSample = useCallback((direction: VolumeDirection, sample: VolumeSample) => {
    setLatestSamples((current) => ({ ...current, [direction]: sample }))
    const capture = activeCaptureRef.current
    if (!capture || capture.direction !== direction) return

    setCaptures((current) => ({
      ...current,
      [direction]: {
        ...current[direction],
        [capture.phase]: [...current[direction][capture.phase], sample.raw].slice(-5000),
      },
    }))
  }, [])

  const recordInputSample = useCallback(
    (sample: VolumeSample) => recordVolumeSample('input', sample),
    [recordVolumeSample],
  )
  const recordOutputSample = useCallback(
    (sample: VolumeSample) => recordVolumeSample('output', sample),
    [recordVolumeSample],
  )

  const activeConfig = useMemo(() => normalizeConfig(config), [config])
  const activeTheme = useMemo(
    () =>
      themeMode === 'customized'
        ? customizedTheme(theme, themePreset)
        : ({ name: theme, preset: themePreset } as const),
    [theme, themeMode, themePreset],
  )
  const activeRenderer = themeMode === 'renderer' ? renderPlaygroundTheme : undefined
  const showcaseSlotProps = useMemo(
    () =>
      themeMode === 'customized'
        ? ({
            content: {
              style: { filter: 'drop-shadow(0 16px 32px rgba(99, 45, 140, 0.32))' },
            },
          } as const)
        : undefined,
    [themeMode],
  )
  const providerReady = getProviderReady(provider, activeConfig)
  const providerAdapter = useMemo(
    () =>
      createProviderAdapter(
        provider,
        activeConfig,
        isCalibratableProvider(provider)
          ? {
              getInput: () => getActiveCalibration('input'),
              getOutput: () => getActiveCalibration('output'),
              onInputSample: recordInputSample,
              onOutputSample: recordOutputSample,
            }
          : undefined,
      ),
    [activeConfig, getActiveCalibration, provider, recordInputSample, recordOutputSample],
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
    setCalibrationDirection(provider === 'vapi' ? 'output' : 'input')
    setCaptures({
      input: copyCapture(EMPTY_CAPTURE),
      output: copyCapture(EMPTY_CAPTURE),
    })
    activeCaptureRef.current = undefined
    setActiveCapture(undefined)
    setLatestSamples({})
    setLastFit(undefined)
  }, [provider])

  const toggleCapturePhase = useCallback(
    (phase: CalibrationPhase) => {
      const next =
        activeCapture?.direction === calibrationDirection && activeCapture.phase === phase
          ? undefined
          : { direction: calibrationDirection, phase }

      if (next) {
        setCaptures((current) => ({
          ...current,
          [calibrationDirection]: {
            ...current[calibrationDirection],
            [phase]: [],
          },
        }))
      }
      activeCaptureRef.current = next
      setActiveCapture(next)
    },
    [activeCapture, calibrationDirection],
  )

  const generateCalibration = useCallback(() => {
    if (!isCalibratableProvider(provider)) return
    const fit = fitVolumeCalibration(captures[calibrationDirection])
    setCalibration((current) => {
      const next = {
        ...current,
        [provider]: {
          ...current[provider],
          [calibrationDirection]: fit.calibration,
        },
      }
      calibrationRef.current = next
      return next
    })
    setLastFit({ provider, direction: calibrationDirection, fit })
  }, [calibrationDirection, captures, provider])

  const resetCalibration = useCallback(() => {
    if (!isCalibratableProvider(provider)) return
    const shipped = copyProviderCalibrations()[provider][calibrationDirection]
    if (!shipped) return
    setCalibration((current) => {
      const next = {
        ...current,
        [provider]: {
          ...current[provider],
          [calibrationDirection]: copyCalibration(shipped),
        },
      }
      calibrationRef.current = next
      return next
    })
    setCaptures((current) => ({
      ...current,
      [calibrationDirection]: copyCapture(EMPTY_CAPTURE),
    }))
    activeCaptureRef.current = undefined
    setActiveCapture(undefined)
    setLatestSamples((current) => ({ ...current, [calibrationDirection]: undefined }))
    setLastFit(undefined)
  }, [calibrationDirection, provider])

  const changeCalibrationDirection = useCallback((direction: VolumeDirection) => {
    activeCaptureRef.current = undefined
    setActiveCapture(undefined)
    setCalibrationDirection(direction)
  }, [])

  const displayedSignal = provider === 'manual' ? manualSignal : latestSignal
  const activeState = provider === 'manual' ? manualSignal.state : latestSignal.state
  const activeVolume =
    activeState === 'listening'
      ? (displayedSignal.inputVolume ?? 0)
      : activeState === 'speaking'
        ? (displayedSignal.outputVolume ?? 0)
        : 0

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

              <div className="provider-control-group">
                <span className="provider-label">Motion preset</span>
                <div className="provider-segment">
                  {THEME_PRESETS.map((item) => (
                    <button
                      className={`provider-button ${themePreset === item ? 'is-selected' : ''}`}
                      key={item}
                      onClick={() => setThemePreset(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="provider-control-group">
                <span className="provider-label">Customization</span>
                <div className="provider-segment">
                  {THEME_MODES.map((item) => (
                    <button
                      className={`provider-button ${themeMode === item.id ? 'is-selected' : ''}`}
                      key={item.id}
                      onClick={() => setThemeMode(item.id)}
                      type="button"
                    >
                      {item.label}
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
                  renderTheme={activeRenderer}
                  signal={manualSignal}
                  size={280}
                  slotProps={showcaseSlotProps}
                  style={{ '--orb-ui-radial-control-surround': '#101010' }}
                  theme={activeTheme}
                />
              ) : (
                <Orb
                  adapter={monitoredAdapter}
                  aria-label={`Start ${provider} session`}
                  data-testid="provider-playground-orb"
                  disabled={!providerReady}
                  interactive={themeMode === 'renderer' || theme !== 'cloud'}
                  renderTheme={activeRenderer}
                  size={280}
                  slotProps={showcaseSlotProps}
                  style={{ '--orb-ui-radial-control-surround': '#101010' }}
                  theme={activeTheme}
                />
              )}
            </div>

            {provider !== 'manual' && theme === 'cloud' && themeMode !== 'renderer' ? (
              <div className="provider-controls">
                <div className="provider-control-group">
                  <span className="provider-label">External session controls</span>
                  <div className="provider-segment">
                    <button
                      className="provider-button"
                      disabled={
                        !providerReady ||
                        !monitoredAdapter?.start ||
                        (activeState !== 'idle' && activeState !== 'error')
                      }
                      onClick={() => void monitoredAdapter?.start?.()}
                      type="button"
                    >
                      Start
                    </button>
                    <button
                      className="provider-button"
                      disabled={
                        !monitoredAdapter?.stop || activeState === 'idle' || activeState === 'error'
                      }
                      onClick={() => void monitoredAdapter?.stop?.()}
                      type="button"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

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
                <p className="provider-note">
                  Configuration, including credentials, is saved in this browser for this exact
                  playground URL. Use Clear to remove the current provider&apos;s saved values.
                </p>
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

            {isCalibratableProvider(provider) ? (
              <GuidedCalibrationControls
                activePhase={
                  activeCapture?.direction === calibrationDirection
                    ? activeCapture.phase
                    : undefined
                }
                calibration={getActiveCalibration(calibrationDirection)}
                capture={captures[calibrationDirection]}
                direction={calibrationDirection}
                fit={
                  lastFit?.provider === provider && lastFit.direction === calibrationDirection
                    ? lastFit.fit
                    : undefined
                }
                onDirectionChange={changeCalibrationDirection}
                onGenerate={generateCalibration}
                onReset={resetCalibration}
                onTogglePhase={toggleCapturePhase}
                provider={provider}
                sample={latestSamples[calibrationDirection]}
              />
            ) : null}

            <section className="provider-panel provider-diagnostics">
              <span className="provider-label">Latest Signal</span>
              <div className="provider-signal-list">
                <SignalRow label="state" value={displayedSignal.state} />
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
