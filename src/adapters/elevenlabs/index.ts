import type { OrbAdapter, AdapterCallbacks } from '../types'

// TODO: Install @elevenlabs/client as a peer dependency when implementing
// ElevenLabs Conversational AI docs: https://elevenlabs.io/docs/conversational-ai

/**
 * Creates an OrbAdapter for ElevenLabs Conversational AI.
 *
 * @param conversation - A Conversation instance from @elevenlabs/client
 *
 * @example
 * import { Conversation } from '@elevenlabs/client'
 * import { VoiceOrb } from 'orb-ui'
 * import { createElevenLabsAdapter } from 'orb-ui/adapters'
 *
 * const conversation = await Conversation.startSession({ agentId: 'your-agent-id' })
 * const adapter = createElevenLabsAdapter(conversation)
 *
 * <VoiceOrb adapter={adapter} theme="jarvis" />
 */
export function createElevenLabsAdapter(conversation: any): OrbAdapter {
  return {
    subscribe({ onStateChange, onVolumeChange }: AdapterCallbacks) {
      // TODO: Map ElevenLabs events to OrbState
      //
      // ElevenLabs Conversation emits:
      //   onConnect            → 'connecting'
      //   onDisconnect         → 'disconnected'
      //   onModeChange({ mode }) where mode is 'speaking' | 'listening'
      //     'speaking'         → 'speaking'
      //     'listening'        → 'listening'
      //   onAudioOutput(data)  → extract amplitude for onVolumeChange
      //   onError              → 'error'
      //
      // Note: ElevenLabs doesn't expose a 'thinking' state directly.
      // It can be inferred as the gap between 'listening' end and 'speaking' start.

      console.warn('[orb-ui] ElevenLabs adapter is not yet implemented.')
      void conversation
      void onStateChange
      void onVolumeChange

      return () => {}
    },
  }
}
