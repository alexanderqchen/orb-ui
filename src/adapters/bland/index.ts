import type { OrbAdapter, AdapterCallbacks } from '../types'

// TODO: Bland AI web SDK docs: https://docs.bland.ai

/**
 * Creates an OrbAdapter for Bland AI voice agents.
 *
 * @param client - A Bland client instance
 */
export function createBlandAdapter(client: any): OrbAdapter {
  return {
    subscribe({ onStateChange, onVolumeChange }: AdapterCallbacks) {
      // TODO: Map Bland events to OrbState
      //
      // Investigate Bland's web SDK event API and map to OrbState.
      // Key states to detect: connected, speaking, listening, disconnected, error.
      // For volume: tap into the audio stream and use Web Audio API AnalyserNode
      // to compute RMS amplitude if Bland doesn't expose volume natively.

      console.warn('[orb-ui] Bland adapter is not yet implemented.')
      void client
      void onStateChange
      void onVolumeChange

      return () => {}
    },
  }
}
