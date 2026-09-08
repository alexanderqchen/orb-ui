import { Room, TokenSource, createAudioAnalyser } from 'livekit-client'
import {
  createLiveKitAdapter as createAdvancedLiveKitAdapter,
  type LiveKitOrbAdapter,
  type LiveKitTokenOptions,
} from './index'
import type { VolumeCalibrationSource, VolumeSample } from '../audio-level'

interface LiveKitBrowserAdapterBase extends Omit<LiveKitTokenOptions, 'agentName' | 'roomName'> {
  /** Agent dispatched into the room. Required for LiveKit Cloud sandbox sessions. */
  agentName?: LiveKitTokenOptions['agentName']
  /** Defaults to a fresh `orb-<uuid>` room name for every start. */
  roomName?: LiveKitTokenOptions['roomName']
  /** LiveKit room.connect options passed through unchanged. */
  connectOptions?: Record<string, unknown>
  /** Enable the local microphone after connecting. Defaults to true. */
  enableMicrophone?: boolean
  /** Optional live-tunable input calibration overrides. */
  inputVolumeCalibration?: VolumeCalibrationSource
  /** Optional live-tunable output calibration overrides. */
  outputVolumeCalibration?: VolumeCalibrationSource
  /** Receives raw, mapped, and normalized input levels for diagnostics. */
  onInputVolumeSample?: (sample: VolumeSample) => void
  /** Receives raw, mapped, and normalized output levels for diagnostics. */
  onOutputVolumeSample?: (sample: VolumeSample) => void
}

export type LiveKitTokenEndpointOptions = Omit<RequestInit, 'body'>

export interface LiveKitSandboxOptions {
  /** Override LiveKit's default Cloud API base URL. */
  baseUrl?: string
}

export interface LiveKitEndpointAdapterConfig extends LiveKitBrowserAdapterBase {
  /** LiveKit TokenSource endpoint returning `{ server_url, participant_token }`. */
  tokenEndpoint: string
  /** Optional fetch settings such as authenticated request headers. */
  tokenEndpointOptions?: LiveKitTokenEndpointOptions
  sandboxId?: never
  sandboxOptions?: never
}

export interface LiveKitSandboxAdapterConfig extends LiveKitBrowserAdapterBase {
  /** LiveKit Cloud sandbox token server ID. Sandbox mode is intended for testing only. */
  sandboxId: string
  /** The agent to dispatch into the sandbox room. */
  agentName: NonNullable<LiveKitTokenOptions['agentName']>
  /** Optional LiveKit sandbox host overrides. */
  sandboxOptions?: LiveKitSandboxOptions
  tokenEndpoint?: never
  tokenEndpointOptions?: never
}

export type LiveKitBrowserAdapterConfig = LiveKitEndpointAdapterConfig | LiveKitSandboxAdapterConfig

function createRoomName() {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `orb-${id}`
}

/**
 * Creates a managed LiveKit Agents adapter using the official browser SDK.
 *
 * This entrypoint owns the LiveKit Room, token source, microphone, playback,
 * and audio analysers. Import the advanced factory from `orb-ui/adapters`
 * only when your application already owns those pieces.
 */
export function createLiveKitAdapter(config: LiveKitBrowserAdapterConfig): LiveKitOrbAdapter {
  const {
    agentMetadata,
    agentName,
    connectOptions,
    deployment,
    enableMicrophone,
    participantAttributes,
    participantIdentity,
    participantMetadata,
    participantName,
    roomName = createRoomName,
    inputVolumeCalibration,
    outputVolumeCalibration,
    onInputVolumeSample,
    onOutputVolumeSample,
  } = config

  const tokenSource =
    config.tokenEndpoint !== undefined
      ? TokenSource.endpoint(config.tokenEndpoint, config.tokenEndpointOptions)
      : TokenSource.sandboxTokenServer(config.sandboxId, config.sandboxOptions)

  return createAdvancedLiveKitAdapter({
    tokenSource,
    tokenOptions: {
      agentMetadata,
      agentName,
      deployment,
      participantAttributes,
      participantIdentity,
      participantMetadata,
      participantName,
      roomName,
    },
    connectOptions,
    enableMicrophone,
    inputVolumeCalibration,
    outputVolumeCalibration,
    onInputVolumeSample,
    onOutputVolumeSample,
    createAudioAnalyser,
    RoomClass: Room,
  }) as LiveKitOrbAdapter
}

export type { LiveKitOrbAdapter } from './index'
