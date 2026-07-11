import type { OrbSignal, OrbState } from './Orb.types'

export function deriveOrbState(
  state: OrbState | undefined,
  signal: OrbSignal | undefined,
  adapterSignal: OrbSignal,
): OrbState {
  return state ?? signal?.state ?? adapterSignal.state
}

export function deriveOrbVolume(volume: number | undefined, state: OrbState, signal: OrbSignal) {
  if (volume !== undefined) return volume
  if (state === 'listening') return signal.inputVolume ?? signal.volume ?? 0
  if (state === 'speaking') return signal.outputVolume ?? signal.volume ?? 0
  return signal.volume ?? 0
}
