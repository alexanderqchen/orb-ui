import type {
  OrbAdapter,
  OrbSignal,
  OrbSignalListener,
  OrbState,
} from '../components/Orb/Orb.types'

export type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState }

/**
 * Shared mic volume curve — rescale real-world mic range to 0–1 with pow shaping
 * for custom provider adapters that need browser-side input metering.
 */
export function normalizeMicVolume(v: number): number {
  let vol = Math.min(v / 0.5, 1.0)
  vol = Math.pow(vol, 1.3)
  return vol
}
