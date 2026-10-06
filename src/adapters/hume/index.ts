import type { OrbAdapter, OrbSignal, OrbSignalListener } from '../types'

/** Structural subset of @humeai/voice-react's existing useVoice() context. */
export interface HumeVoiceSnapshot {
  status: { value: 'disconnected' | 'connecting' | 'connected' | 'error'; reason?: string }
  isPlaying: boolean
  error?: unknown
  isMuted?: boolean
  isAudioMuted?: boolean
  /** App-owned generation/tool state; EVI transcripts are not playback boundaries. */
  isThinking?: boolean
  /** Values from useMicFft()/usePlayerFft(): SDK Bark bands in the range 0–2. */
  micFft?: readonly number[]
  playerFft?: readonly number[]
}

/** Visual activity from Hume's 0–2 Bark bands, not PCM RMS or loudness. */
export function humeFftToVolume(bands: readonly number[] | undefined) {
  if (!bands?.length) return 0
  let sum = 0
  for (const band of bands) {
    const value = Number.isFinite(band) ? Math.max(0, Math.min(1, band / 2)) : 0
    sum += value * value
  }
  return Math.sqrt(sum / bands.length)
}

/** Controlled React bridge: the existing VoiceProvider keeps all audio ownership. */
export function humeVoiceToOrbSignal(snapshot: HumeVoiceSnapshot): OrbSignal {
  if (snapshot.status.value === 'error' || snapshot.error) {
    return {
      state: 'error',
      inputVolume: 0,
      outputVolume: 0,
      error: snapshot.error ?? new Error(snapshot.status.reason ?? 'Hume session failed'),
    }
  }
  if (snapshot.status.value !== 'connected') {
    return {
      state: snapshot.status.value === 'connecting' ? 'connecting' : 'idle',
      inputVolume: 0,
      outputVolume: 0,
    }
  }
  return {
    state:
      snapshot.isPlaying && !snapshot.isAudioMuted
        ? 'speaking'
        : snapshot.isThinking
          ? 'thinking'
          : 'listening',
    inputVolume: snapshot.isMuted ? 0 : humeFftToVolume(snapshot.micFft),
    outputVolume:
      snapshot.isPlaying && !snapshot.isAudioMuted ? humeFftToVolume(snapshot.playerFft) : 0,
  }
}

export interface HumeMessage {
  type: string
  interim?: boolean
}

/** One connection's guarded observation callbacks. Replace on every reconnect. */
export interface HumeSessionBridge {
  observe(snapshot: HumeVoiceSnapshot): void
  onMessage(message: HumeMessage): void
  onInterruption(): void
  onError(error: unknown): void
  close(): void
}

export interface HumeAdapterOptions {
  /** Optional app lifecycle. Use the existing useVoice().connect(), never another client. */
  connect?: (session: HumeSessionBridge, signal: AbortSignal) => void | Promise<void>
  disconnect?: () => void | Promise<void>
}

export interface HumeOrbAdapter extends OrbAdapter {
  /** Bind observations/callbacks to a fresh connection; old callbacks become inert. */
  createSession(): HumeSessionBridge
  stop(): Promise<void>
}

/**
 * Session-scoped observer for an app-owned Hume VoiceProvider. It captures no
 * microphone, creates no audio player, and opens no provider connection itself.
 */
export function createHumeAdapter(options: HumeAdapterOptions = {}): HumeOrbAdapter {
  const listeners = new Set<OrbSignalListener>()
  let signal: OrbSignal = { state: 'idle', inputVolume: 0, outputVolume: 0 }
  let generation = 0
  let controller: AbortController | undefined
  let startPromise: Promise<void> | undefined
  let stopPromise: Promise<void> | undefined

  function emit(next: OrbSignal) {
    signal = next
    listeners.forEach((listener) => listener(next))
  }

  function createSession(): HumeSessionBridge {
    controller?.abort()
    controller = undefined
    const id = ++generation
    let snapshot: HumeVoiceSnapshot = { status: { value: 'connecting' }, isPlaying: false }
    let thinking = false
    let interrupted = false
    emit(humeVoiceToOrbSignal(snapshot))
    const current = () => id === generation
    const sync = () => {
      if (!current()) return
      emit(
        humeVoiceToOrbSignal({
          ...snapshot,
          isPlaying: snapshot.isPlaying && !interrupted,
          isThinking: snapshot.isThinking ?? thinking,
        }),
      )
    }
    return {
      observe(next) {
        if (!current()) return
        // Ignore nonterminal stale render snapshots after a local/provider error.
        if (signal.state === 'error' && next.status.value === 'connected') return
        if (!next.isPlaying) interrupted = false
        if (next.isPlaying && !interrupted) thinking = false
        snapshot = next
        sync()
        if (next.status.value === 'disconnected') generation += 1
      },
      onMessage(message) {
        if (!current() || snapshot.status.value !== 'connected' || signal.state === 'error') {
          return
        }
        if (message.type === 'user_interruption') {
          interrupted = true
          thinking = false
        } else if (
          (message.type === 'user_message' && message.interim !== true) ||
          message.type === 'tool_call'
        ) {
          thinking = true
        } else if (message.type === 'assistant_end') {
          thinking = false
        }
        // assistant_message/audio_output are generation/receipt, not audible playback.
        sync()
      },
      onInterruption() {
        if (!current() || snapshot.status.value !== 'connected') return
        interrupted = true
        thinking = false
        sync()
      },
      onError(error) {
        if (!current()) return
        snapshot = { ...snapshot, status: { value: 'error' }, error }
        sync()
      },
      close() {
        if (!current()) return
        generation += 1
        controller?.abort()
        controller = undefined
        if (signal.state !== 'error') emit({ state: 'idle', inputVolume: 0, outputVolume: 0 })
      },
    }
  }

  function stop() {
    if (stopPromise) return stopPromise
    generation += 1
    controller?.abort()
    controller = undefined
    startPromise = undefined
    emit({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    const operation = (async () => {
      try {
        await options.disconnect?.()
      } catch (error) {
        emit({ state: 'error', inputVolume: 0, outputVolume: 0, error })
        throw error
      }
    })()
    stopPromise = operation
    void operation
      .finally(() => {
        if (stopPromise === operation) stopPromise = undefined
      })
      .catch(() => undefined)
    return operation
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      listener(signal)
      return () => {
        listeners.delete(listener)
      }
    },
    createSession,
    ...(options.connect
      ? {
          start() {
            if (startPromise) return startPromise
            if (signal.state !== 'idle' && signal.state !== 'error') return Promise.resolve()
            const request = generation
            const operation = (async () => {
              if (stopPromise) await stopPromise
              if (request !== generation) return
              const session = createSession()
              const abort = new AbortController()
              const id = generation
              controller = abort
              try {
                await options.connect?.(session, abort.signal)
              } catch (error) {
                if (id !== generation || abort.signal.aborted) return
                session.onError(error)
                // The app lifecycle is responsible for the existing provider's cleanup.
                try {
                  await options.disconnect?.()
                } catch {
                  // Preserve the connection failure.
                }
                throw error
              }
            })()
            startPromise = operation
            void operation
              .finally(() => {
                if (startPromise === operation) startPromise = undefined
              })
              .catch(() => undefined)
            return operation
          },
        }
      : {}),
    stop,
  }
}
