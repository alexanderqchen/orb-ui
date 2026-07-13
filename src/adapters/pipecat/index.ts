import type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState } from '../types'
import { calibrateOutputVolume, createMediaStreamTrackVolumeMeter } from '../audio-level'
import type {
  AudioContextSource,
  MediaStreamTrackVolumeMeter,
  OutputVolumeCalibration,
  OutputVolumeCalibrationSource,
  OutputVolumeSample,
} from '../audio-level'

type PipecatListener = (...args: unknown[]) => void

/** Minimal PipecatClient surface used by orb-ui. */
export interface PipecatClientLike {
  on(event: string, listener: PipecatListener): unknown
  off?(event: string, listener: PipecatListener): unknown
  removeListener?(event: string, listener: PipecatListener): unknown
  connect(...args: unknown[]): Promise<unknown>
  disconnect(): void | Promise<void>
  state?: string
  tracks?(): PipecatTracksLike
}

export interface PipecatParticipantLike {
  id?: string
  name?: string
  local?: boolean
}

export interface PipecatTracksLike {
  local?: { audio?: MediaStreamTrack }
  bot?: { audio?: MediaStreamTrack }
}

export interface PipecatAdapterOptions {
  /**
   * Starts and connects the Pipecat client. Override this for transport-specific
   * connection params or `startBotAndConnect()` endpoints.
   */
  connect?: () => void | Promise<unknown>
  /** Disconnects the Pipecat client. Defaults to `client.disconnect()`. */
  disconnect?: () => void | Promise<void>
  /**
   * Optional filter for multi-participant transports. Remote audio from local
   * participants is ignored automatically.
   */
  isBotParticipant?: (participant: PipecatParticipantLike) => boolean
  /** Play remote bot audio tracks automatically. Defaults to true. */
  playRemoteAudio?: boolean
  /** Runtime override for custom audio element ownership. */
  createAudioElement?: () => HTMLAudioElement
  /** Return undefined to disable browser-track volume metering. */
  createAudioContext?: AudioContextSource
  /** Optional live-tunable output shaping. A getter is read for every meter sample. */
  outputVolumeCalibration?: OutputVolumeCalibrationSource
  /** Receives raw, shaped, and smoothed output levels for diagnostics. */
  onOutputVolumeSample?: (sample: OutputVolumeSample) => void
}

export interface PipecatOrbAdapter extends OrbAdapter {
  start(): Promise<void>
  stop(): Promise<void>
}

const PIPECAT_EVENTS = {
  connected: 'connected',
  disconnected: 'disconnected',
  transportStateChanged: 'transportStateChanged',
  botReady: 'botReady',
  botDisconnected: 'botDisconnected',
  error: 'error',
  messageError: 'messageError',
  deviceError: 'deviceError',
  localAudioLevel: 'localAudioLevel',
  remoteAudioLevel: 'remoteAudioLevel',
  botStartedSpeaking: 'botStartedSpeaking',
  botStoppedSpeaking: 'botStoppedSpeaking',
  userStartedSpeaking: 'userStartedSpeaking',
  userStoppedSpeaking: 'userStoppedSpeaking',
  botLlmStarted: 'botLlmStarted',
  botTtsStarted: 'botTtsStarted',
} as const

// Daily/Pipecat reports audio gain in the full 0-1 range, but conversational
// speech commonly occupies only the bottom few hundredths of that range. Shape
// those values before they reach a theme so quiet speech still produces useful
// motion, then smooth the 100 ms level updates without making speech feel laggy.
const INPUT_AUDIO_LEVEL_NOISE_FLOOR = 0.002
const INPUT_AUDIO_LEVEL_GAIN = 4
const INPUT_AUDIO_LEVEL_EXPONENT = 0.8
const INPUT_AUDIO_LEVEL_ATTACK = 0.6
const INPUT_AUDIO_LEVEL_RELEASE = 0.2
const DEFAULT_PIPECAT_OUTPUT_CALIBRATION: OutputVolumeCalibration = {
  noiseFloor: 0.002,
  gain: 5.1,
  exponent: 0.8,
  attack: 0.5,
  release: 0.22,
}

function defaultCreateAudioContext() {
  if (typeof window === 'undefined') return undefined
  const AudioContextClass = window.AudioContext
  return AudioContextClass ? new AudioContextClass() : undefined
}

function stateFromTransport(state: string): OrbState | undefined {
  switch (state) {
    case 'initializing':
    case 'initialized':
    case 'authenticating':
    case 'authenticated':
    case 'connecting':
    case 'connected':
      return 'connecting'
    case 'ready':
      return 'listening'
    case 'disconnected':
    case 'disconnecting':
      return 'idle'
    case 'error':
      return 'error'
    default:
      return undefined
  }
}

function shapeAudioLevel(level: unknown): number {
  if (
    typeof level !== 'number' ||
    !Number.isFinite(level) ||
    level <= INPUT_AUDIO_LEVEL_NOISE_FLOOR
  ) {
    return 0
  }

  const gated = Math.min(1, Math.max(0, level - INPUT_AUDIO_LEVEL_NOISE_FLOOR))
  return Math.pow(Math.min(1, gated * INPUT_AUDIO_LEVEL_GAIN), INPUT_AUDIO_LEVEL_EXPONENT)
}

function smoothAudioLevel(level: unknown, previous: number): number {
  const shaped = shapeAudioLevel(level)
  const rate = shaped > previous ? INPUT_AUDIO_LEVEL_ATTACK : INPUT_AUDIO_LEVEL_RELEASE
  return previous + (shaped - previous) * rate
}

function isMediaStreamTrack(track: unknown): track is MediaStreamTrack {
  return (
    typeof track === 'object' &&
    track !== null &&
    'kind' in track &&
    typeof (track as { kind?: unknown }).kind === 'string'
  )
}

/**
 * Creates a signal-native adapter for Pipecat's JavaScript client.
 *
 * The adapter is transport-agnostic: Daily, SmallWebRTC, Pipecat Cloud, and
 * custom transports all expose the same RTVI events through `PipecatClient`.
 */
export function createPipecatAdapter(
  client: PipecatClientLike,
  options: PipecatAdapterOptions = {},
): PipecatOrbAdapter {
  const listeners = new Set<OrbSignalListener>()
  const remoteAudioElements = new Map<MediaStreamTrack, HTMLAudioElement>()
  let signal: OrbSignal = {
    state: stateFromTransport(client.state ?? '') ?? 'idle',
    volume: 0,
    inputVolume: 0,
    outputVolume: 0,
  }
  let listening = false
  let inputLevel = 0
  let outputLevel = 0
  let inputMeterTrack: MediaStreamTrack | null = null
  let outputMeterTrack: MediaStreamTrack | null = null
  let inputMeter: MediaStreamTrackVolumeMeter | undefined
  let outputMeter: MediaStreamTrackVolumeMeter | undefined

  function getOutputVolumeCalibration() {
    const overrides =
      typeof options.outputVolumeCalibration === 'function'
        ? options.outputVolumeCalibration()
        : options.outputVolumeCalibration
    return { ...DEFAULT_PIPECAT_OUTPUT_CALIBRATION, ...overrides }
  }

  function emit(next: OrbSignal) {
    signal = next
    listeners.forEach((listener) => listener(next))
  }

  function emitState(state: OrbState, error?: unknown) {
    inputLevel = 0
    outputLevel = 0
    emit({
      state,
      volume: 0,
      inputVolume: 0,
      outputVolume: 0,
      ...(error === undefined ? {} : { error }),
    })
  }

  function emitInputVolume(level: unknown) {
    if (signal.state !== 'listening') return
    inputLevel = smoothAudioLevel(level, inputLevel)
    const inputVolume = inputLevel
    emit({ ...signal, volume: inputVolume, inputVolume, outputVolume: 0 })
  }

  function emitOutputVolume(level: unknown, participant?: unknown) {
    if (signal.state !== 'speaking') return

    if (participant && typeof participant === 'object') {
      const candidate = participant as PipecatParticipantLike
      if (candidate.local || (options.isBotParticipant && !options.isBotParticipant(candidate))) {
        return
      }
    }

    const sample = calibrateOutputVolume(
      typeof level === 'number' ? level : 0,
      outputLevel,
      getOutputVolumeCalibration,
    )
    outputLevel = sample.normalized
    options.onOutputVolumeSample?.(sample)
    const outputVolume = sample.normalized
    emit({ ...signal, volume: outputVolume, inputVolume: 0, outputVolume })
  }

  function stopInputMeter() {
    inputMeterTrack = null
    void inputMeter?.stop()
    inputMeter = undefined
  }

  function stopOutputMeter() {
    outputMeterTrack = null
    void outputMeter?.stop()
    outputMeter = undefined
  }

  function stopTrackMeters() {
    stopInputMeter()
    stopOutputMeter()
  }

  function startInputMeter(track: MediaStreamTrack) {
    if (inputMeterTrack === track && inputMeter) return
    stopInputMeter()
    inputMeterTrack = track
    inputMeter = createMediaStreamTrackVolumeMeter(
      track,
      options.createAudioContext ?? defaultCreateAudioContext,
      emitInputVolume,
    )
    if (!inputMeter) inputMeterTrack = null
  }

  function startOutputMeter(track: MediaStreamTrack) {
    if (outputMeterTrack === track && outputMeter) return
    stopOutputMeter()
    outputMeterTrack = track
    outputMeter = createMediaStreamTrackVolumeMeter(
      track,
      options.createAudioContext ?? defaultCreateAudioContext,
      emitOutputVolume,
    )
    if (!outputMeter) outputMeterTrack = null
  }

  function syncTrackMeters() {
    const tracks = client.tracks?.()
    if (tracks?.local?.audio) startInputMeter(tracks.local.audio)
    if (tracks?.bot?.audio) startOutputMeter(tracks.bot.audio)
  }

  function isBotParticipant(participant: unknown) {
    if (!participant || typeof participant !== 'object') return true
    const candidate = participant as PipecatParticipantLike
    if (candidate.local) return false
    return options.isBotParticipant?.(candidate) ?? true
  }

  function playRemoteTrack(track: unknown, participant?: unknown) {
    if (
      options.playRemoteAudio === false ||
      !isMediaStreamTrack(track) ||
      track.kind !== 'audio' ||
      !isBotParticipant(participant)
    ) {
      return
    }

    const audio = options.createAudioElement?.() ?? new Audio()
    audio.autoplay = true
    audio.srcObject = new MediaStream([track])
    remoteAudioElements.set(track, audio)
    void audio.play().catch(() => undefined)
  }

  function stopRemoteTrack(track: unknown) {
    if (!isMediaStreamTrack(track)) return
    const audio = remoteAudioElements.get(track)
    if (!audio) return
    audio.pause()
    audio.srcObject = null
    audio.remove()
    remoteAudioElements.delete(track)
  }

  function handleTrackStarted(track: unknown, participant?: unknown) {
    if (!isMediaStreamTrack(track) || track.kind !== 'audio') return

    const knownLocalTrack = client.tracks?.().local?.audio
    const local =
      (participant as PipecatParticipantLike | undefined)?.local === true ||
      track === knownLocalTrack
    if (local) startInputMeter(track)
    else if (isBotParticipant(participant)) startOutputMeter(track)

    playRemoteTrack(track, participant)
  }

  function handleTrackStopped(track: unknown) {
    if (track === inputMeterTrack) stopInputMeter()
    if (track === outputMeterTrack) stopOutputMeter()
    stopRemoteTrack(track)
  }

  function stopRemoteAudio() {
    remoteAudioElements.forEach((audio) => {
      audio.pause()
      audio.srcObject = null
      audio.remove()
    })
    remoteAudioElements.clear()
  }

  function handleDisconnected() {
    stopTrackMeters()
    emitState('idle')
  }

  function handleBotReady() {
    emitState('listening')
    syncTrackMeters()
  }

  const eventHandlers: Array<[string, PipecatListener]> = [
    [PIPECAT_EVENTS.connected, () => emitState('connecting')],
    [PIPECAT_EVENTS.botReady, handleBotReady],
    [PIPECAT_EVENTS.disconnected, handleDisconnected],
    [PIPECAT_EVENTS.botDisconnected, handleDisconnected],
    [
      PIPECAT_EVENTS.transportStateChanged,
      (state) => {
        if (typeof state !== 'string') return
        const nextState = stateFromTransport(state)
        if (nextState) emitState(nextState)
      },
    ],
    [PIPECAT_EVENTS.userStartedSpeaking, () => emitState('listening')],
    [
      PIPECAT_EVENTS.userStoppedSpeaking,
      () => {
        if (signal.state === 'listening') emitState('thinking')
      },
    ],
    [PIPECAT_EVENTS.botLlmStarted, () => emitState('thinking')],
    [PIPECAT_EVENTS.botTtsStarted, () => emitState('thinking')],
    [PIPECAT_EVENTS.botStartedSpeaking, () => emitState('speaking')],
    [PIPECAT_EVENTS.botStoppedSpeaking, () => emitState('listening')],
    [PIPECAT_EVENTS.localAudioLevel, (level) => !inputMeter && emitInputVolume(level)],
    [
      PIPECAT_EVENTS.remoteAudioLevel,
      (level, participant) => !outputMeter && emitOutputVolume(level, participant),
    ],
    ['trackStarted', handleTrackStarted],
    ['trackStopped', handleTrackStopped],
    [PIPECAT_EVENTS.error, (error) => emitState('error', error)],
    [PIPECAT_EVENTS.messageError, (error) => emitState('error', error)],
    [PIPECAT_EVENTS.deviceError, (error) => emitState('error', error)],
  ]

  function addClientListeners() {
    if (listening) return
    listening = true
    eventHandlers.forEach(([event, listener]) => client.on(event, listener))
  }

  function removeClientListeners() {
    if (!listening) return
    listening = false
    eventHandlers.forEach(([event, listener]) => {
      if (client.off) client.off(event, listener)
      else client.removeListener?.(event, listener)
    })
    stopTrackMeters()
    stopRemoteAudio()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      addClientListeners()
      listener(signal)

      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) removeClientListeners()
      }
    },

    async start() {
      emitState('connecting')
      try {
        await (options.connect ? options.connect() : client.connect())
      } catch (error) {
        emitState('error', error)
        throw error
      }
    },

    async stop() {
      try {
        await (options.disconnect ? options.disconnect() : client.disconnect())
      } finally {
        stopTrackMeters()
        stopRemoteAudio()
        emitState('idle')
      }
    },
  }
}
