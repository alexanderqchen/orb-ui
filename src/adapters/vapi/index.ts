import type { OrbAdapter, OrbState, AdapterCallbacks } from '../types'

// TODO: Install @vapi-ai/web as a peer dependency when implementing
// Vapi SDK docs: https://docs.vapi.ai/sdk/web

/**
 * Creates an OrbAdapter for Vapi voice agents.
 *
 * @param client - A Vapi client instance from @vapi-ai/web
 *
 * @example
 * import Vapi from '@vapi-ai/web'
 * import { VoiceOrb } from 'orb-ui'
 * import { createVapiAdapter } from 'orb-ui/adapters'
 *
 * const vapi = new Vapi('your-public-key')
 * const adapter = createVapiAdapter(vapi)
 *
 * <VoiceOrb adapter={adapter} theme="jarvis" />
 */
export function createVapiAdapter(client: any): OrbAdapter {
  return {
    subscribe({ onStateChange, onVolumeChange }: AdapterCallbacks) {
      // TODO: Map Vapi events to OrbState
      //
      // Vapi emits the following relevant events:
      //   'call-start'          → 'connecting' then 'listening'
      //   'call-end'            → 'disconnected'
      //   'speech-start'        → 'speaking' (AI is speaking)
      //   'speech-end'          → 'listening' (back to user's turn)
      //   'volume-level' (0–1)  → onVolumeChange(volume)
      //   'error'               → 'error'
      //
      // Example (uncomment when implementing):
      //
      // const onCallStart = () => onStateChange('connecting')
      // const onCallEnd = () => onStateChange('disconnected')
      // const onSpeechStart = () => onStateChange('speaking')
      // const onSpeechEnd = () => onStateChange('listening')
      // const onVolume = (v: number) => onVolumeChange(v)
      // const onError = () => onStateChange('error')
      //
      // client.on('call-start', onCallStart)
      // client.on('call-end', onCallEnd)
      // client.on('speech-start', onSpeechStart)
      // client.on('speech-end', onSpeechEnd)
      // client.on('volume-level', onVolume)
      // client.on('error', onError)
      //
      // return () => {
      //   client.off('call-start', onCallStart)
      //   client.off('call-end', onCallEnd)
      //   client.off('speech-start', onSpeechStart)
      //   client.off('speech-end', onSpeechEnd)
      //   client.off('volume-level', onVolume)
      //   client.off('error', onError)
      // }

      console.warn('[orb-ui] Vapi adapter is not yet implemented.')
      void client
      void onStateChange
      void onVolumeChange

      return () => {}
    },
  }
}
