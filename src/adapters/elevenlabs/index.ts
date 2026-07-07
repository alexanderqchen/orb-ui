import type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState } from '../types'

// ─── ElevenLabs type interfaces ───────────────────────────────────────────────
// We define minimal interfaces rather than importing @elevenlabs/client directly
// so orb-ui doesn't pull in the SDK as a hard dependency — users already have it.

export type ElevenLabsMode = 'speaking' | 'listening'
export type ElevenLabsStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting'
export type ElevenLabsConnectionType = 'websocket' | 'webrtc'

export interface ElevenLabsCallbacks {
  onConnect?: (props: { conversationId: string }) => void
  onDisconnect?: (details: unknown) => void
  onError?: (message: string, context?: unknown) => void
  onModeChange?: (prop: { mode: ElevenLabsMode }) => void
  onStatusChange?: (prop: { status: ElevenLabsStatus }) => void
  onVadScore?: (props: { vadScore: number }) => void
}

export interface ElevenLabsConversation {
  endSession(): Promise<void>
  getInputVolume(): number // normalized RMS of mic input (0–1)
  getOutputVolume(): number // normalized RMS of AI audio output (0–1)
  getInputByteFrequencyData(): Uint8Array
  getOutputByteFrequencyData(): Uint8Array
}

type ElevenLabsSessionAuth =
  | {
      agentId: string
      signedUrl?: never
      conversationToken?: never
      connectionType?: ElevenLabsConnectionType
    }
  | {
      signedUrl: string
      agentId?: never
      conversationToken?: never
      connectionType?: 'websocket'
    }
  | {
      conversationToken: string
      agentId?: never
      signedUrl?: never
      connectionType?: 'webrtc'
    }

export type ElevenLabsConfig = ElevenLabsSessionAuth & {
  /** orb-ui expects a voice conversation, so text-only sessions are intentionally unsupported. */
  textOnly?: false
  /** Allow @elevenlabs/client startSession options that orb-ui does not inspect. */
  [key: string]: unknown
}

export type ElevenLabsStartSessionOptions = ElevenLabsConfig & ElevenLabsCallbacks

// The Conversation namespace from @elevenlabs/client (minimal structural interface).
export interface ElevenLabsConversationClass {
  startSession(options: ElevenLabsStartSessionOptions): Promise<ElevenLabsConversation>
}

// ─── Extended adapter interface ───────────────────────────────────────────────
// ElevenLabs callbacks must be injected at startSession() time, so the adapter
// owns the session lifecycle and exposes start/stop methods that Orb can call
// automatically when the adapter is passed to the `adapter` prop.

export interface ElevenLabsOrbAdapter extends OrbAdapter {
  /** Start an ElevenLabs conversation. Called automatically by Orb on click. */
  start(): Promise<void>
  /** Stop the current ElevenLabs conversation. Called automatically by Orb on click. */
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
//   • getInputVolume()          — Web Audio RMS of user input, polled ~30fps.
//   • getOutputVolume()         — Web Audio RMS of AI output, polled ~30fps.
//     Apply gain to make visual movement readable across providers.
//
// EMA config: lighter than Vapi (EL signal is already clean, less smoothing needed)
//   attack=0.5 (fast rise), release=0.15 (moderate decay)

/**
 * Creates an OrbAdapter for ElevenLabs Conversational AI.
 *
 * Unlike createVapiAdapter, this adapter owns the session lifecycle because
 * ElevenLabs requires callbacks to be injected at Conversation.startSession()
 * time. Pass the returned adapter to Orb and Orb will call start()/stop()
 * when the clickable theme is activated.
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
 *   return <Orb adapter={adapter} theme="circle" aria-label="Start ElevenLabs assistant" />
 * }
 */
export function createElevenLabsAdapter(
  ConversationClass: ElevenLabsConversationClass,
  config: ElevenLabsConfig,
): ElevenLabsOrbAdapter {
  // Active conversation instance + cleanup reference
  let conversation: ElevenLabsConversation | null = null
  let activeSessionId = 0
  let startPromise: Promise<void> | null = null
  let volumeInterval: ReturnType<typeof setInterval> | null = null
  let signal: OrbSignal = { state: 'idle', volume: 0, inputVolume: 0, outputVolume: 0 }
  let currentState: OrbState = 'idle'

  // Subscriber registry — supports multiple simultaneous subscribers
  // (e.g. Orb + signal monitor both subscribing at the same time)
  const subscribers = new Set<OrbSignalListener>()

  function emitSignal(nextSignal: OrbSignal) {
    signal = nextSignal
    subscribers.forEach((listener) => listener(nextSignal))
  }

  function emitPatch(patch: Partial<OrbSignal> & { state?: OrbState }) {
    signal = { ...signal, ...patch, state: patch.state ?? signal.state }
    emitSignal(signal)
  }

  function setState(state: OrbState) {
    currentState = state
    emitPatch({ state })
  }

  function startVolumePolling() {
    if (volumeInterval) return
    volumeInterval = setInterval(() => {
      if (!conversation) return
      if (currentState === 'listening') {
        const inputVolume = Math.min(conversation.getInputVolume() * 2.0, 1.0)
        emitPatch({ volume: inputVolume, inputVolume })
      } else if (currentState === 'speaking') {
        const outputVolume = Math.min(conversation.getOutputVolume() * 2.0, 1.0)
        emitPatch({ volume: outputVolume, outputVolume })
      }
    }, 33) // ~30 fps
  }

  function clearVolumePolling() {
    if (volumeInterval) {
      clearInterval(volumeInterval)
      volumeInterval = null
    }
  }

  function stopVolumePolling() {
    clearVolumePolling()
    emitPatch({ volume: 0, inputVolume: 0, outputVolume: 0 })
  }

  function emitIdleSignal() {
    currentState = 'idle'
    emitPatch({ state: 'idle', volume: 0, inputVolume: 0, outputVolume: 0 })
  }

  function isActiveSession(sessionId: number) {
    return sessionId === activeSessionId
  }

  function createElevenLabsCallbacks(sessionId: number): ElevenLabsCallbacks {
    return {
      onStatusChange: ({ status }) => {
        if (!isActiveSession(sessionId)) return
        if (status === 'connecting') setState('connecting')
      },

      onConnect: () => {
        if (!isActiveSession(sessionId)) return
        setState('listening')
        startVolumePolling()
      },

      onModeChange: ({ mode }) => {
        if (!isActiveSession(sessionId)) return
        if (mode === 'speaking') {
          setState('speaking')
          startVolumePolling()
        } else {
          setState('listening')
          startVolumePolling()
        }
      },

      onDisconnect: () => {
        if (!isActiveSession(sessionId)) return
        clearVolumePolling()
        conversation = null
        emitIdleSignal()
      },

      onError: (message) => {
        if (!isActiveSession(sessionId)) return
        console.error('[orb-ui/elevenlabs] Error:', message)
        clearVolumePolling()
        currentState = 'error'
        emitPatch({ state: 'error', volume: 0, inputVolume: 0, outputVolume: 0, error: message })
        conversation = null
      },
    }
  }

  return {
    // ── OrbAdapter.subscribe ────────────────────────────────────────────────
    subscribe(listener: OrbSignalListener) {
      subscribers.add(listener)
      listener(signal)
      if (conversation && (currentState === 'listening' || currentState === 'speaking')) {
        startVolumePolling()
      }
      return () => {
        subscribers.delete(listener)
        if (subscribers.size === 0) stopVolumePolling()
      }
    },

    // ── Lifecycle ───────────────────────────────────────────────────────────
    async start() {
      if (conversation || startPromise) return startPromise ?? undefined // already running
      activeSessionId += 1
      const sessionId = activeSessionId
      startPromise = (async () => {
        try {
          const nextConversation = await ConversationClass.startSession({
            ...config,
            ...createElevenLabsCallbacks(sessionId),
          })
          if (!isActiveSession(sessionId)) {
            await nextConversation.endSession().catch((err: unknown) => {
              console.error('[orb-ui/elevenlabs] stale session cleanup failed:', err)
            })
            return
          }
          conversation = nextConversation
        } catch (err) {
          if (!isActiveSession(sessionId)) return
          console.error('[orb-ui/elevenlabs] startSession failed:', err)
          setState('error')
          emitPatch({ volume: 0, inputVolume: 0, outputVolume: 0, error: err })
        } finally {
          startPromise = null
        }
      })()
      return startPromise
    },

    async stop() {
      const activeConversation = conversation
      if (!activeConversation) {
        if (startPromise) {
          activeSessionId += 1
          clearVolumePolling()
          emitIdleSignal()
          await startPromise
        }
        return
      }
      const sessionId = activeSessionId
      clearVolumePolling()
      try {
        await activeConversation.endSession()
      } catch (err) {
        console.error('[orb-ui/elevenlabs] endSession failed:', err)
      }
      if (conversation === activeConversation && isActiveSession(sessionId)) {
        conversation = null
        emitIdleSignal()
      }
    },
  }
}
