import type { AdapterCallbacks, OrbSignal, OrbSignalListener, OrbState } from './Orb.types'

export type HybridOrbSignalListener = OrbSignalListener & AdapterCallbacks

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

export function createOrbSignalListener(
  onSignal: OrbSignalListener,
  onLegacyAdapterUsed: () => void,
): HybridOrbSignalListener {
  let currentSignal: OrbSignal = { state: 'idle' }

  const emit = (nextSignal: OrbSignal) => {
    currentSignal = nextSignal
    onSignal(nextSignal)
  }

  const listener = ((signal: OrbSignal) => {
    emit(signal)
  }) as HybridOrbSignalListener

  listener.onStateChange = (state) => {
    onLegacyAdapterUsed()
    emit({ ...currentSignal, state })
  }

  listener.onVolumeChange = (volume) => {
    onLegacyAdapterUsed()
    emit({ ...currentSignal, volume })
  }

  return listener
}
