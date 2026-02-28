import type { OrbAdapter, OrbState, AdapterCallbacks } from '../types'

// ─── ElevenLabs type interfaces ───────────────────────────────────────────────
// We define minimal interfaces rather than importing @elevenlabs/client directly
// so orb-ui doesn't pull in the SDK as a hard dependency — users already have it.

type ElevenLabsMode   = 'speaking' | 'listening'
type ElevenLabsStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting'

interface ElevenLabsCallbacks {
  onConnect?:       (props: { conversationId: string }) => void
  onDisconnect?:    (details: unknown) => void
  onError?:         (message: string, context?: unknown) => void
  onModeChange?:    (prop: { mode: ElevenLabsMode }) => void
  onStatusChange?:  (prop: { status: ElevenLabsStatus }) => void
  onVadScore?:      (props: { vadScore: number }) => void
}

interface ElevenLabsConversation {
  endSession():              Promise<void>
  getInputVolume():          number   // normalized RMS of mic input (0–1)
  getOutputVolume():         number   // normalized RMS of AI audio output (0–1)
  getInputByteFrequencyData():  Uint8Array
  getOutputByteFrequencyData(): Uint8Array
}

type ElevenLabsConfig = {
  // Provide either agentId (public) or signedUrl (server-side auth)
  agentId?:   string
  signedUrl?: string
  // Any other @elevenlabs/client startSession options are passed through
  [key: string]: unknown
}

// The Conversation class interface (just the static startSession we need)
interface ElevenLabsConversationClass {
  startSession(options: ElevenLabsConfig & ElevenLabsCallbacks): Promise<ElevenLabsConversation>
}

// ─── Extended adapter interface ───────────────────────────────────────────────
// ElevenLabs callbacks must be injected at startSession() time, so the adapter
// owns the session lifecycle and exposes start/stop methods. Pass these to
// VoiceOrb's onStart / onStop props.

export interface ElevenLabsOrbAdapter extends OrbAdapter {
  /** Call this from VoiceOrb's onStart prop to begin a conversation. */
  start(): Promise<void>
  /** Call this from VoiceOrb's onStop prop to end the current conversation. */
  stop(): Promise<void>
}

// ─── Volume notes ─────────────────────────────────────────────────────────────
//
// Unlike Vapi, ElevenLabs provides a clean, continuous audio signal via its
// Web Audio worklet — no quantization artifacts, no noise floor treatment needed.
//
// Volume sources:
//   • onVadScore({ vadScore })  — VAD probability 0–1, fires continuously
//     during the listening state. Drives the orb while the user speaks.
//   • getOutputVolume()         — RMS of the AI's audio output, polled at
//     ~30 fps during the speaking state. Drives the orb while the AI speaks.
//
// getOutputVolume() typically returns small RMS values even at normal speech
// volume (WebRTC audio is normalized but not loud). We amplify by 1.8× and
// clamp to 1.0 to make the orb respond visibly.

const OUTPUT_GAIN = 1.8

/**
 * Creates an OrbAdapter for ElevenLabs Conversational AI.
 *
 * Unlike createVapiAdapter, this adapter owns the session lifecycle because
 * ElevenLabs requires callbacks to be injected at Conversation.startSession()
 * time. Use the returned start() and stop() methods with VoiceOrb's props.
 *
 * @param ConversationClass - The Conversation class from @elevenlabs/client
 * @param config            - agentId / signedUrl + any other startSession options
 *
 * @example
 * import { Conversation } from '@elevenlabs/client'
 * import { VoiceOrb } from 'orb-ui'
 * import { createElevenLabsAdapter } from 'orb-ui/adapters'
 *
 * const adapter = createElevenLabsAdapter(Conversation, {
 *   agentId: 'your-agent-id',
 * })
 *
 * function App() {
 *   return (
 *     <VoiceOrb
 *       adapter={adapter}
 *       theme="circle"
 *       onStart={() => adapter.start()}
 *       onStop={() => adapter.stop()}
 *     />
 *   )
 * }
 */
export function createElevenLabsAdapter(
  ConversationClass: ElevenLabsConversationClass,
  config: ElevenLabsConfig,
): ElevenLabsOrbAdapter {
  // Active conversation instance + cleanup reference
  let conversation:    ElevenLabsConversation | null = null
  let volumeInterval:  ReturnType<typeof setInterval> | null = null
  let currentMode:     ElevenLabsMode = 'listening'

  // Subscriber callbacks — set when VoiceOrb subscribes
  let _onStateChange: ((s: OrbState) => void) | null = null
  let _onVolumeChange: ((v: number) => void) | null  = null

  function emitState(s: OrbState) { _onStateChange?.(s) }
  function emitVolume(v: number)  { _onVolumeChange?.(v) }

  function startVolumePolling() {
    if (volumeInterval) return
    volumeInterval = setInterval(() => {
      if (!conversation) return
      const raw = conversation.getOutputVolume()
      emitVolume(Math.min(1, raw * OUTPUT_GAIN))
    }, 33) // ~30 fps
  }

  function stopVolumePolling() {
    if (volumeInterval) { clearInterval(volumeInterval); volumeInterval = null }
    emitVolume(0)
  }

  // ElevenLabs callbacks — injected into startSession
  const elevenLabsCallbacks: ElevenLabsCallbacks = {
    onStatusChange: ({ status }) => {
      if (status === 'connecting') emitState('connecting')
    },

    onConnect: () => {
      emitState('listening')
    },

    onModeChange: ({ mode }) => {
      currentMode = mode
      if (mode === 'speaking') {
        emitState('speaking')
        startVolumePolling()
      } else {
        emitState('listening')
        stopVolumePolling()
        // Volume during listening is driven by onVadScore below
      }
    },

    onVadScore: ({ vadScore }) => {
      // VAD fires continuously during listening — drive the orb with mic energy
      if (currentMode === 'listening') {
        emitVolume(vadScore)
      }
    },

    onDisconnect: () => {
      stopVolumePolling()
      emitState('disconnected')
      emitVolume(0)
      conversation = null
    },

    onError: (message) => {
      console.error('[orb-ui/elevenlabs] Error:', message)
      stopVolumePolling()
      emitState('error')
      emitVolume(0)
      conversation = null
    },
  }

  return {
    // ── OrbAdapter.subscribe ────────────────────────────────────────────────
    subscribe({ onStateChange, onVolumeChange }: AdapterCallbacks) {
      _onStateChange  = onStateChange
      _onVolumeChange = onVolumeChange

      return () => {
        _onStateChange  = null
        _onVolumeChange = null
        stopVolumePolling()
      }
    },

    // ── Lifecycle ───────────────────────────────────────────────────────────
    async start() {
      if (conversation) return // already running
      try {
        conversation = await ConversationClass.startSession({
          ...config,
          ...elevenLabsCallbacks,
        })
      } catch (err) {
        console.error('[orb-ui/elevenlabs] startSession failed:', err)
        emitState('error')
        emitVolume(0)
      }
    },

    async stop() {
      if (!conversation) return
      stopVolumePolling()
      try {
        await conversation.endSession()
      } catch (err) {
        console.error('[orb-ui/elevenlabs] endSession failed:', err)
      }
      conversation = null
    },
  }
}
