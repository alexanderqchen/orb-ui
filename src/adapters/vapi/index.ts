import type { OrbAdapter, OrbState, AdapterCallbacks } from '../types'

// Minimal interface for the Vapi client from @vapi-ai/web.
// We define our own so orb-ui doesn't require @vapi-ai/web as a dependency —
// users already have it installed.
interface VapiClient {
  on(event: 'call-start', listener: () => void): void
  on(event: 'call-end', listener: () => void): void
  on(event: 'speech-start', listener: () => void): void
  on(event: 'speech-end', listener: () => void): void
  on(event: 'volume-level', listener: (volume: number) => void): void
  on(event: 'message', listener: (message: VapiMessage) => void): void
  on(event: 'error', listener: (error: unknown) => void): void
  removeListener(event: string, listener: (...args: unknown[]) => void): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  start(...args: any[]): Promise<unknown>
}

interface VapiMessage {
  type: string
  role?: string
  transcriptType?: 'partial' | 'final'
  transcript?: string
}

/**
 * Creates an OrbAdapter for Vapi voice agents.
 *
 * State mapping:
 *   vapi.start() called (intercepted)      → 'connecting'
 *   call-start                             → 'listening'
 *   message (final user transcript)        → 'thinking'  (AI is now processing)
 *   speech-start                           → 'speaking'  (AI is speaking)
 *   speech-end                             → 'listening' (back to user's turn)
 *   call-end                               → 'disconnected'
 *   error                                  → 'error'
 *
 * Note: Vapi has no native 'connecting' event. The adapter intercepts
 * vapi.start() to emit 'connecting' immediately, then hands off to Vapi
 * events for the rest of the lifecycle. The original start() is restored
 * on unsubscribe.
 *
 * @param client - A Vapi instance from @vapi-ai/web
 *
 * @example
 * import Vapi from '@vapi-ai/web'
 * import { VoiceOrb } from 'orb-ui'
 * import { createVapiAdapter } from 'orb-ui/adapters'
 *
 * const vapi = new Vapi('your-public-key')
 * const adapter = createVapiAdapter(vapi)
 *
 * function App() {
 *   return (
 *     <VoiceOrb
 *       adapter={adapter}
 *       theme="jarvis"
 *       onStart={() => vapi.start('your-assistant-id')}
 *       onStop={() => vapi.stop()}
 *     />
 *   )
 * }
 */
export function createVapiAdapter(client: VapiClient): OrbAdapter {
  return {
    subscribe({ onStateChange, onVolumeChange }: AdapterCallbacks) {
      // call-start: connection established, ready for user input
      const onCallStart = () => {
        onStateChange('listening')
      }

      // call-end: session finished
      const onCallEnd = () => {
        onStateChange('disconnected')
        onVolumeChange(0)
      }

      // speech-start: AI is now speaking
      const onSpeechStart = () => {
        onStateChange('speaking')
      }

      // speech-end: AI finished speaking, back to user's turn
      const onSpeechEnd = () => {
        onStateChange('listening')
        onVolumeChange(0)
      }

      // volume-level: already normalized 0–1 by Vapi
      const onVolumeLevel = (volume: number) => {
        onVolumeChange(volume)
      }

      // message: watch for final user transcript to infer 'thinking' state.
      // When the user finishes speaking (final transcript), the AI is processing.
      const onMessage = (message: VapiMessage) => {
        if (
          message.type === 'transcript' &&
          message.transcriptType === 'final' &&
          message.role === 'user'
        ) {
          onStateChange('thinking')
          onVolumeChange(0)
        }
      }

      // error: something went wrong
      const onError = (error: unknown) => {
        console.error('[orb-ui/vapi] Error:', error)
        onStateChange('error')
        onVolumeChange(0)
      }

      client.on('call-start', onCallStart)
      client.on('call-end', onCallEnd)
      client.on('speech-start', onSpeechStart)
      client.on('speech-end', onSpeechEnd)
      client.on('volume-level', onVolumeLevel)
      client.on('message', onMessage)
      client.on('error', onError)

      // Intercept vapi.start() to emit 'connecting' immediately.
      // Vapi has no native connecting event — this fills the gap between
      // the user pressing Start and call-start firing (typically 1–3s).
      const originalStart = client.start.bind(client)
      client.start = async (...args) => {
        onStateChange('connecting')
        return originalStart(...args)
      }

      return () => {
        client.removeListener('call-start', onCallStart as () => void)
        client.removeListener('call-end', onCallEnd as () => void)
        client.removeListener('speech-start', onSpeechStart as () => void)
        client.removeListener('speech-end', onSpeechEnd as () => void)
        client.removeListener('volume-level', onVolumeLevel as (...args: unknown[]) => void)
        client.removeListener('message', onMessage as (...args: unknown[]) => void)
        client.removeListener('error', onError as (...args: unknown[]) => void)
        // Restore original start on cleanup
        client.start = originalStart
      }
    },
  }
}
