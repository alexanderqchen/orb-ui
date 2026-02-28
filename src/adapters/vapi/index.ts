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
//      This zeroes out the two lowest quantized levels (0.000667, 0.00667)
//      which are never real speech energy.
//   b. Linear ramp — rescales the gated value to the full 0–1 range so that
//      genuine quiet speech (0.0667) reads as ~0.0 after gating, not 0.42.
//   c. EMA (exponential moving average) — smooths the alternating loud/silent
//      pattern. Fast attack (0.65/tick) catches new speech immediately; slow
//      release (0.12/tick) bridges ~100 ms dips without visible float.
//
// The resulting value is a clean, continuous 0–1 signal ready for the theme.
//
// NOTE: This normalization is intentionally NOT in CircleTheme or any other
// theme. The theme just receives a clean 0–1 signal regardless of adapter.

const NOISE_FLOOR = 0.12
let emaVol = 0   // EMA state persists across start/stop cycles

function normalizeVapiVolume(raw: number): number {
  const gated = raw < NOISE_FLOOR ? 0 : (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
  const rate  = gated > emaVol ? 0.65 : 0.12
  emaVol      = emaVol + (gated - emaVol) * rate
  return emaVol
}

// ─── Vapi-specific state debouncing ──────────────────────────────────────────
//
// Vapi fires  speaking → listening → speaking  within ~200 ms at every
// turn boundary (the AI finishes a sentence, briefly expects user input,
// then continues). This flicker causes the visual layer to restart its rAF
// loop and reset animation position on every turn.
//
// Fix: debounce the speaking → listening transition by 350 ms.
// If speaking fires again before the timer expires the pending listening
// event is silently dropped. Any other state transition cancels the timer
// and emits immediately.

let stateDebounceTimer: ReturnType<typeof setTimeout> | null = null

function makeStateEmitter(onStateChange: (s: OrbState) => void) {
  let lastEmitted: OrbState = 'idle'

  return function emitState(next: OrbState) {
    if (stateDebounceTimer) {
      clearTimeout(stateDebounceTimer)
      stateDebounceTimer = null
    }

    if (lastEmitted === 'speaking' && next === 'listening') {
      stateDebounceTimer = setTimeout(() => {
        lastEmitted = next
        onStateChange(next)
        stateDebounceTimer = null
      }, 350)
      return
    }

    lastEmitted = next
    onStateChange(next)
  }
}

/**
 * Creates an OrbAdapter for Vapi voice agents.
 *
 * State mapping:
 *   vapi.start() called (intercepted)      → 'connecting'
 *   call-start                             → 'listening'
 *   message (final user transcript)        → 'thinking'
 *   speech-start                           → 'speaking'
 *   speech-end                             → 'listening'  (debounced 350 ms)
 *   call-end                               → 'disconnected'
 *   error                                  → 'error'
 *
 * Volume: raw Vapi values are normalized (noise gate + EMA) before being
 * passed to onVolumeChange, so themes receive a clean 0–1 signal.
 *
 * @param client - A Vapi instance from @vapi-ai/web
 */
export function createVapiAdapter(client: VapiClient): OrbAdapter {
  // ── Mic leak prevention ──────────────────────────────────────────────────
  // Vapi's WebRTC teardown doesn't always release the microphone track,
  // especially on repeated start/stop cycles. We intercept getUserMedia to
  // capture the stream reference, then explicitly stop all tracks on call-end.
  let latestAudioStream: MediaStream | null = null

  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    const _origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await _origGUM(constraints)
      if (constraints?.audio) latestAudioStream = stream
      return stream
    }
  }

  function releaseMic() {
    latestAudioStream?.getTracks().forEach(track => {
      if (track.readyState === 'live') track.stop()
    })
    latestAudioStream = null
  }

  return {
    subscribe({ onStateChange, onVolumeChange }: AdapterCallbacks) {
      const emitState = makeStateEmitter(onStateChange)

      const onCallStart  = () => emitState('listening')

      const onCallEnd = () => {
        emitState('disconnected')
        onVolumeChange(0)
        emaVol = 0
        releaseMic()
      }

      const onSpeechStart = () => emitState('speaking')

      const onSpeechEnd = () => {
        emitState('listening')   // debounced — may be suppressed if speaking fires again quickly
        onVolumeChange(0)
      }

      const onVolumeLevel = (volume: number) => {
        onVolumeChange(normalizeVapiVolume(volume))
      }

      const onMessage = (message: VapiMessage) => {
        if (
          message.type === 'transcript' &&
          message.transcriptType === 'final' &&
          message.role === 'user'
        ) {
          emitState('thinking')
          onVolumeChange(0)
        }
      }

      const onError = (error: unknown) => {
        console.error('[orb-ui/vapi] Error:', error)
        emitState('error')
        onVolumeChange(0)
        emaVol = 0
        releaseMic()
      }

      client.on('call-start',   onCallStart)
      client.on('call-end',     onCallEnd)
      client.on('speech-start', onSpeechStart)
      client.on('speech-end',   onSpeechEnd)
      client.on('volume-level', onVolumeLevel)
      client.on('message',      onMessage)
      client.on('error',        onError)

      // Intercept vapi.start() to emit 'connecting' immediately
      const originalStart = client.start.bind(client)
      client.start = async (...args) => {
        emitState('connecting')
        return originalStart(...args)
      }

      return () => {
        if (stateDebounceTimer) {
          clearTimeout(stateDebounceTimer)
          stateDebounceTimer = null
        }
        client.removeListener('call-start',   onCallStart as () => void)
        client.removeListener('call-end',     onCallEnd as () => void)
        client.removeListener('speech-start', onSpeechStart as () => void)
        client.removeListener('speech-end',   onSpeechEnd as () => void)
        client.removeListener('volume-level', onVolumeLevel as (...args: unknown[]) => void)
        client.removeListener('message',      onMessage as (...args: unknown[]) => void)
        client.removeListener('error',        onError as (...args: unknown[]) => void)
        client.start = originalStart
        releaseMic()
      }
    },
  }
}
