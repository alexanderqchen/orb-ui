import type { OrbAdapter, OrbState, AdapterCallbacks } from '../types'

// ─── ElevenLabs type interfaces ───────────────────────────────────────────────
// We define minimal interfaces rather than importing @elevenlabs/client directly
// so orb-ui doesn't pull in the SDK as a hard dependency — users already have it.

type ElevenLabsMode = 'speaking' | 'listening'
type ElevenLabsStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting'

interface ElevenLabsCallbacks {
  onConnect?: (props: { conversationId: string }) => void
  onDisconnect?: (details: unknown) => void
  onError?: (message: string, context?: unknown) => void
  onModeChange?: (prop: { mode: ElevenLabsMode }) => void
  onStatusChange?: (prop: { status: ElevenLabsStatus }) => void
  onVadScore?: (props: { vadScore: number }) => void
}

interface ElevenLabsConversation {
  endSession(): Promise<void>
  getInputVolume(): number // normalized RMS of mic input (0–1)
  getOutputVolume(): number // normalized RMS of AI audio output (0–1)
  getInputByteFrequencyData(): Uint8Array
  getOutputByteFrequencyData(): Uint8Array
}

type ElevenLabsConfig = {
  // Provide either agentId (public) or signedUrl (server-side auth)
  agentId?: string
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
// Orb's onStart / onStop props.

export interface ElevenLabsOrbAdapter extends OrbAdapter {
  /** Call this from Orb's onStart prop to begin a conversation. */
  start(): Promise<void>
  /** Call this from Orb's onStop prop to end the current conversation. */
  stop(): Promise<void>
}

// ─── ElevenLabs signal normalization ─────────────────────────────────────────
//
// ElevenLabs provides two clean, continuous audio signals — no quantization
// artifacts like Vapi. However both signals need gain + smoothing to match
// Vapi's normalized output range.
//
// Empirical measurements (2026-03-02, live call):
//   Raw PEAK = 0.64, AVG = 0.49 with OUTPUT_GAIN=1.8 → target PEAK ~0.95
//   → New OUTPUT_GAIN = 1.8 × (0.95 / 0.64) = 2.7
//
// Volume sources:
//   • onVadScore({ vadScore })  — VAD probability 0–1, fires during listening.
//     Apply noise gate at 0.05 + EMA to clean up mic bleed between words.
//   • getOutputVolume()         — Web Audio RMS of AI output, polled ~30fps.
//     Apply OUTPUT_GAIN + EMA to match Vapi's dynamic range.
//
// EMA config: lighter than Vapi (EL signal is already clean, less smoothing needed)
//   attack=0.5 (fast rise), release=0.15 (moderate decay)

/**
 * Creates an OrbAdapter for ElevenLabs Conversational AI.
 *
 * Unlike createVapiAdapter, this adapter owns the session lifecycle because
 * ElevenLabs requires callbacks to be injected at Conversation.startSession()
 * time. Use the returned start() and stop() methods with Orb's props.
 *
 * @param ConversationClass - The Conversation class from @elevenlabs/client
 * @param config            - agentId / signedUrl + any other startSession options
 *
 * @example
 * import { Conversation } from '@elevenlabs/client'
 * import { Orb } from 'orb-ui'
 * import { createElevenLabsAdapter } from 'orb-ui/adapters'
 *
 * const adapter = createElevenLabsAdapter(Conversation, {
 *   agentId: 'your-agent-id',
 * })
 *
 * function App() {
 *   return (
 *     <Orb
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
  let conversation: ElevenLabsConversation | null = null
  let volumeInterval: ReturnType<typeof setInterval> | null = null

  // Subscriber registry — supports multiple simultaneous subscribers
  // (e.g. Orb + signal monitor both subscribing at the same time)
  const subscribers = new Set<AdapterCallbacks>()

  function emitState(s: OrbState) {
    subscribers.forEach((cb) => cb.onStateChange(s))
  }
  function emitVolume(v: number) {
    subscribers.forEach((cb) => cb.onVolumeChange(v))
  }

  function startVolumePolling() {
    if (volumeInterval) return
    volumeInterval = setInterval(() => {
      if (!conversation) return
      const raw = conversation.getOutputVolume()
      emitVolume(Math.min(raw * 2.0, 1.0))
    }, 33) // ~30 fps
  }

  function stopVolumePolling() {
    if (volumeInterval) {
      clearInterval(volumeInterval)
      volumeInterval = null
    }
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
      if (mode === 'speaking') {
        emitState('speaking')
        startVolumePolling()
      } else {
        emitState('listening')
        stopVolumePolling()
      }
    },

    onDisconnect: () => {
      stopVolumePolling()
      emitState('idle')
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
    subscribe(callbacks: AdapterCallbacks) {
      subscribers.add(callbacks)
      return () => {
        subscribers.delete(callbacks)
        if (subscribers.size === 0) stopVolumePolling()
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
