import type { OrbAdapter, OrbSignal, OrbSignalListener, OrbState } from '../types'
import { createVolumeNormalizer } from '../audio-level'
import type { VolumeCalibrationSource, VolumeSample } from '../audio-level'
import { PROVIDER_VOLUME_CALIBRATIONS } from '../volume-presets'

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
// A short source-specific hold removes the alternating false-zero artifact
// before the canonical elapsed-time envelope is applied.
const DROPOUT_HOLD_MS = 160

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
 * Volume: raw Vapi values are mapped through the provider profile and emitted
 * as a stable normalized outputVolume envelope while the assistant is speaking.
 *
 * @param client  - A Vapi instance from @vapi-ai/web
 * @param options - Optional config (e.g. assistantId to pass to vapi.start())
 */

export interface VapiAdapterOptions {
  /** Assistant ID passed to vapi.start() when the orb is clicked. */
  assistantId?: string
  /** Optional live-tunable output calibration overrides. */
  outputVolumeCalibration?: VolumeCalibrationSource
  /** Receives raw, mapped, and normalized output levels for diagnostics. */
  onOutputVolumeSample?: (sample: VolumeSample) => void
}

export function createVapiAdapter(client: VapiClient, options?: VapiAdapterOptions): OrbAdapter {
  const startListeners = new Set<() => void>()
  let originalStart: VapiClient['start'] | null = null

  function ensureStartIntercept() {
    if (originalStart) return

    originalStart = client.start.bind(client)
    client.start = async (...args) => {
      startListeners.forEach((listener) => listener())
      return originalStart!(...args)
    }
  }

  function restoreStartInterceptIfUnused() {
    if (startListeners.size > 0 || !originalStart) return

    client.start = originalStart
    originalStart = null
  }

  return {
    async start() {
      await client.start(options?.assistantId)
    },

    stop() {
      client.stop()
    },

    subscribe(listener: OrbSignalListener) {
      let signal: OrbSignal = { state: 'idle', outputVolume: 0 }
      const outputNormalizer = createVolumeNormalizer(
        PROVIDER_VOLUME_CALIBRATIONS.vapi.output,
        options?.outputVolumeCalibration,
      )

      function emitSignal(nextSignal: OrbSignal) {
        signal = nextSignal
        listener(nextSignal)
      }

      function emitPatch(patch: Partial<OrbSignal> & { state?: OrbState }) {
        emitSignal({ ...signal, ...patch, state: patch.state ?? signal.state })
      }

      const { emitState, clearTimer } = makeStateEmitter((state) => {
        currentState = state
        if (state === 'listening') {
          stopVolLoop()
          emitPatch({ state, outputVolume: 0 })
        } else {
          emitPatch({ state })
        }
      })
      const onStart = () => emitState('connecting')

      // Track current state so we can gate volume sources
      let currentState: OrbState = 'idle'
      let callActive = false

      const onCallStart = () => {
        callActive = true
        emitState('listening')
      }

      const onCallEnd = () => {
        callActive = false
        currentState = 'idle'
        stopVolLoop()
        emitState('idle')
        emitPatch({ outputVolume: 0 })
      }

      const onSpeechStart = () => {
        if (!callActive) return
        emitState('speaking')
        startVolLoop()
      }

      const onSpeechEnd = () => {
        if (!callActive) return
        // Keep the rAF sampler alive while the debounced speaking state and
        // canonical fall envelope finish. Resetting here made output snap to
        // zero up to 350ms before the state actually changed.
        targetRawVolume = 0
        heldRawVolume = 0
        lastActiveSampleAt = 0
        emitState('listening')
      }

      // Vapi emits volume at ~10Hz. Sample its latest level per frame so elapsed-
      // time envelope behavior remains smooth and consistent with other providers.
      let targetRawVolume = 0
      let heldRawVolume = 0
      let lastActiveSampleAt = 0
      let volRaf = 0

      const volLoop = (now: number) => {
        if (currentState === 'speaking') {
          const raw = now - lastActiveSampleAt <= DROPOUT_HOLD_MS ? heldRawVolume : targetRawVolume
          const sample = outputNormalizer.sample(raw, now)
          options?.onOutputVolumeSample?.(sample)
          emitPatch({ outputVolume: sample.normalized })
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
        targetRawVolume = 0
        heldRawVolume = 0
        lastActiveSampleAt = 0
        outputNormalizer.reset()
      }

      const onVolumeLevel = (volume: number) => {
        // Only use Vapi's volume-level for speaking (AI output).
        if (currentState === 'speaking') {
          targetRawVolume = volume
          if (volume > PROVIDER_VOLUME_CALIBRATIONS.vapi.output.amplitude.silenceFloor) {
            heldRawVolume = volume
            lastActiveSampleAt = performance.now()
          }
        }
      }

      const onMessage = () => {
        // Kept as a listener slot for future use (e.g. function-call events).
      }

      const onError = (error: unknown) => {
        console.error('[orb-ui/vapi] Error:', error)
        callActive = false
        currentState = 'error'
        clearTimer()
        stopVolLoop()
        emitPatch({ state: 'error', outputVolume: 0, error })
      }

      client.on('call-start', onCallStart)
      client.on('call-end', onCallEnd)
      client.on('speech-start', onSpeechStart)
      client.on('speech-end', onSpeechEnd)
      client.on('volume-level', onVolumeLevel)
      client.on('message', onMessage)
      client.on('error', onError)

      // Intercept vapi.start() to emit 'connecting' immediately
      startListeners.add(onStart)
      ensureStartIntercept()

      return () => {
        clearTimer()
        stopVolLoop()
        client.removeListener('call-start', onCallStart as () => void)
        client.removeListener('call-end', onCallEnd as () => void)
        client.removeListener('speech-start', onSpeechStart as () => void)
        client.removeListener('speech-end', onSpeechEnd as () => void)
        client.removeListener('volume-level', onVolumeLevel as (...args: unknown[]) => void)
        client.removeListener('message', onMessage as (...args: unknown[]) => void)
        client.removeListener('error', onError as (...args: unknown[]) => void)
        startListeners.delete(onStart)
        restoreStartInterceptIfUnused()
      }
    },
  }
}
