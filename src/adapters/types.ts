import type { OrbState, OrbAdapter } from '../components/VoiceOrb/VoiceOrb.types'

export type { OrbState, OrbAdapter }

export interface AdapterCallbacks {
  onStateChange: (state: OrbState) => void
  onVolumeChange: (volume: number) => void
}
