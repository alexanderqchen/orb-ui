import type { OrbAdapter, AdapterCallbacks } from '../types'

// TODO: Install @pipecat-ai/client-js as a peer dependency when implementing
// Pipecat docs: https://docs.pipecat.ai/client/javascript

/**
 * Creates an OrbAdapter for Pipecat voice pipelines.
 *
 * @param client - A RTVIClient instance from @pipecat-ai/client-js
 */
export function createPipecatAdapter(client: any): OrbAdapter {
  return {
    subscribe({ onStateChange, onVolumeChange }: AdapterCallbacks) {
      // TODO: Map Pipecat RTVI events to OrbState
      //
      // Pipecat uses the RTVI (Real-Time Voice Inference) protocol.
      // RTVIClient emits:
      //   RTVIEvent.Connected         → 'connecting'
      //   RTVIEvent.Disconnected      → 'disconnected'
      //   RTVIEvent.BotStartedSpeaking → 'speaking'
      //   RTVIEvent.BotStoppedSpeaking → 'listening'
      //   RTVIEvent.UserStartedSpeaking → 'listening'
      //   RTVIEvent.RemoteAudioLevel  → onVolumeChange(level)
      //   RTVIEvent.Error             → 'error'

      console.warn('[orb-ui] Pipecat adapter is not yet implemented.')
      void client
      void onStateChange
      void onVolumeChange

      return () => {}
    },
  }
}
