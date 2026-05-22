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
  stop(): void
}

interface VapiMessage {
  type: string
  role?: string
  transcriptType?: 'partial' | 'final'
  transcript?: string
}

// ─── Vapi-specific volume normalization ───────────────────────────────────────
//
// Vapi's volume-level events have two quirks that must be handled before the
// signal reaches the visual layer:
//
// 1. QUANTIZED VALUES — Vapi only ever emits 6 discrete levels:
//       0, 0.000667, 0.00667, 0.0667, 0.667, 1.0   (each ~10× the previous)
//    These are not a continuous signal; they're essentially log-scale buckets.
//
// 2. ALTERNATING PATTERN — During speech, values frequently alternate between
//    loud (0.667 / 1.0) and near-zero every ~100ms. This is a Vapi artifact,
//    not actual silence between words. Without treatment it causes visible
//    jitter in any animation driven by this signal.
//
// Normalization pipeline (runs at Vapi tick rate, ~10 Hz):
//   a. Noise gate — anything below NOISE_FLOOR is treated as silence (→ 0).
//   b. Linear ramp — rescales the gated value to the full 0–1 range.
//   c. EMA — smooths the alternating loud/silent pattern.
//      Fast attack (0.65) catches new speech; slow release (0.12) bridges dips.

const NOISE_FLOOR = 0.12

// ─── Vapi-specific state debouncing ──────────────────────────────────────────
//
// Vapi fires  speaking → listening → speaking  within ~200 ms at every
// turn boundary. Fix: debounce the speaking → listening transition by 350 ms.

function makeStateEmitter(onStateChange: (s: OrbState) => void) {
  let lastEmitted: OrbState = 'idle'
  let timer: ReturnType<typeof setTimeout> | null = null

  function emitState(next: OrbState) {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }

    if (lastEmitted === 'speaking' && next === 'listening') {
      timer = setTimeout(() => {
        lastEmitted = next
        onStateChange(next)
        timer = null
      }, 350)
      return
    }

    lastEmitted = next
    onStateChange(next)
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return { emitState, clearTimer }
}

/**
 * Creates an OrbAdapter for Vapi voice agents.
 *
 * State mapping:
 *   vapi.start() called (intercepted)      → 'connecting'
 *   call-start                             → 'listening'
 *   speech-start                           → 'speaking'
 *   speech-end                             → 'listening'  (debounced 350 ms)
 *   call-end                               → 'idle'
 *   error                                  → 'error'
 *
 * Volume: raw Vapi values are normalized (noise gate + EMA) before being
 * passed to onVolumeChange, so themes receive a clean 0–1 signal.
 *
 * @param client  - A Vapi instance from @vapi-ai/web
 * @param options - Optional config (e.g. assistantId to pass to vapi.start())
 */

interface VapiAdapterOptions {
  /** Assistant ID passed to vapi.start() when the orb is clicked. */
  assistantId?: string
}

export function createVapiAdapter(client: VapiClient, options?: VapiAdapterOptions): OrbAdapter {
  // ── Per-adapter EMA state ────────────────────────────────────────────────
  // Kept inside the factory so multiple adapter instances never share state.
  let emaVol = 0

  function normalizeVapiVolume(raw: number): number {
    const gated = raw < NOISE_FLOOR ? 0 : (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
    // Light EMA to bridge Vapi's alternating loud/silent artifact
    const rate = gated > emaVol ? 0.8 : 0.5
    emaVol = emaVol + (gated - emaVol) * rate
    return emaVol
  }

  return {
    async start() {
      await client.start(options?.assistantId)
    },

    stop() {
      client.stop()
    },

    subscribe({ onStateChange, onVolumeChange }: AdapterCallbacks) {
      const { emitState, clearTimer } = makeStateEmitter(onStateChange)

      // Track current state so we can gate volume sources
      let currentState: OrbState = 'idle'
      let callActive = false

      const onCallStart = () => {
        callActive = true
        currentState = 'listening'
        emitState('listening')
      }

      const onCallEnd = () => {
        callActive = false
        currentState = 'idle'
        stopVolLoop()
        emitState('idle')
        onVolumeChange(0)
        emaVol = 0
      }

      const onSpeechStart = () => {
        if (!callActive) return
        currentState = 'speaking'
        emitState('speaking')
        startVolLoop()
      }

      const onSpeechEnd = () => {
        if (!callActive) return
        stopVolLoop()
        currentState = 'listening'
        emitState('listening')
      }

      // ── 60fps interpolation loop ──────────────────────────────────────
      // Vapi emits volume at ~10Hz. We lerp at 60fps so themes get smooth data.
      let targetVol = 0
      let currentVol = 0
      let volRaf = 0

      const volLoop = () => {
        if (currentState === 'speaking') {
          currentVol += (targetVol - currentVol) * 0.1
          onVolumeChange(currentVol)
        }
        volRaf = requestAnimationFrame(volLoop)
      }

      const startVolLoop = () => {
        if (!volRaf) volRaf = requestAnimationFrame(volLoop)
      }
      const stopVolLoop = () => {
        if (volRaf) {
          cancelAnimationFrame(volRaf)
          volRaf = 0
        }
        currentVol = 0
        targetVol = 0
      }

      const onVolumeLevel = (volume: number) => {
        // Only use Vapi's volume-level for speaking (AI output)
        // Apply sigmoid curve, then set target for the 60fps lerp loop
        if (currentState === 'speaking') {
          const normalized = normalizeVapiVolume(volume)
          targetVol = normalized / (normalized + 0.3)
        }
      }

      const onMessage = () => {
        // Kept as a listener slot for future use (e.g. function-call events).
      }

      const onError = (error: unknown) => {
        console.error('[orb-ui/vapi] Error:', error)
        stopVolLoop()
        emitState('error')
        onVolumeChange(0)
        emaVol = 0
      }

      client.on('call-start', onCallStart)
      client.on('call-end', onCallEnd)
      client.on('speech-start', onSpeechStart)
      client.on('speech-end', onSpeechEnd)
      client.on('volume-level', onVolumeLevel)
      client.on('message', onMessage)
      client.on('error', onError)

      // Intercept vapi.start() to emit 'connecting' immediately
      const originalStart = client.start.bind(client)
      client.start = async (...args) => {
        emitState('connecting')
        return originalStart(...args)
      }

      return () => {
        clearTimer()
        client.removeListener('call-start', onCallStart as () => void)
        client.removeListener('call-end', onCallEnd as () => void)
        client.removeListener('speech-start', onSpeechStart as () => void)
        client.removeListener('speech-end', onSpeechEnd as () => void)
        client.removeListener('volume-level', onVolumeLevel as (...args: unknown[]) => void)
        client.removeListener('message', onMessage as (...args: unknown[]) => void)
        client.removeListener('error', onError as (...args: unknown[]) => void)
        client.start = originalStart
      }
    },
  }
}
