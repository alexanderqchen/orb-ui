import type { OrbAdapter, OrbSignal, OrbSignalListener } from '../types'

/** The relevant JSON inside a Bedrock bidirectional response chunk (not the AWS envelope). */
export interface NovaSonicEvent {
  contentStart?: {
    contentId: string
    type: 'TEXT' | 'AUDIO' | 'TOOL'
    role: 'USER' | 'ASSISTANT' | 'TOOL'
    additionalModelFields?: string
    audioOutputConfiguration?: { sampleRateHertz?: number }
  }
  textOutput?: { contentId: string; content: string }
  audioOutput?: { contentId: string; content: string }
  contentEnd?: { contentId: string; type?: string; stopReason?: string }
  completionStart?: { completionId?: string }
  completionEnd?: { stopReason?: string }
}

export interface NovaSonicTranscript {
  contentId: string
  role: 'USER' | 'ASSISTANT'
  text: string
  final: boolean
}

export interface NovaSonicBridgeOptions {
  /** The app must stop current playback and discard queued audio synchronously. */
  onInterrupt?: () => void
  /** Only FINAL transcription blocks are reported; speculative model text is not spoken text. */
  onTranscript?: (transcript: NovaSonicTranscript) => void
}

export interface NovaSonicBridge extends OrbAdapter {
  /** An app-generated session ID fences late socket messages from a previous connection. */
  beginSession(sessionId: string): void
  connected(sessionId: string): void
  handleEvent(sessionId: string, event: NovaSonicEvent): void
  setInputVolume(sessionId: string, volume: number): void
  /** Call from the actual player, including when the final buffered chunk finishes. */
  setPlayback(sessionId: string, active: boolean, volume?: number): void
  failed(sessionId: string, error: unknown): void
  endSession(sessionId: string): void
}

const volume = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)

/**
 * Observes an app-owned Node/Socket.IO-to-Bedrock session. This bridge never owns
 * credentials, a microphone, a socket, or playback; Nova 2 Sonic needs a server.
 */
export function createNovaSonicBridge(options: NovaSonicBridgeOptions = {}): NovaSonicBridge {
  const listeners = new Set<OrbSignalListener>()
  const blocks = new Map<
    string,
    { role: 'USER' | 'ASSISTANT' | 'TOOL'; final: boolean; text: string }
  >()
  let signal: OrbSignal = { state: 'idle', inputVolume: 0, outputVolume: 0 }
  let currentSession: string | null = null
  let playing = false
  let turnFinished = false

  function emit(next: OrbSignal) {
    signal = next
    listeners.forEach((listener) => listener(next))
  }

  function reset(state: 'idle' | 'connecting' | 'error', error?: unknown) {
    blocks.clear()
    playing = false
    turnFinished = false
    emit({ state, inputVolume: 0, outputVolume: 0, ...(error === undefined ? {} : { error }) })
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      listener(signal)
      return () => listeners.delete(listener)
    },
    beginSession(sessionId) {
      if (!sessionId) throw new Error('Nova Sonic needs an app session ID')
      options.onInterrupt?.()
      currentSession = sessionId
      reset('connecting')
    },
    connected(sessionId) {
      if (sessionId !== currentSession || signal.state !== 'connecting') return
      emit({ state: 'listening', inputVolume: 0, outputVolume: 0 })
    },
    handleEvent(sessionId, event) {
      if (sessionId !== currentSession || signal.state === 'error') return
      const start = event.contentStart
      if (start) {
        // Protect long-lived apps from malformed streams which never close blocks.
        if (blocks.size >= 128) blocks.delete(blocks.keys().next().value!)
        let final = false
        try {
          const fields: unknown = JSON.parse(start.additionalModelFields ?? '{}')
          final =
            typeof fields === 'object' &&
            fields !== null &&
            'generationStage' in fields &&
            fields.generationStage === 'FINAL'
        } catch {
          // Unknown metadata is never treated as a final transcript.
        }
        blocks.set(start.contentId, { role: start.role, final, text: '' })
        if (start.role === 'USER') {
          turnFinished = false
          emit({ ...signal, state: 'listening' })
        } else if (start.role === 'ASSISTANT' && !playing) {
          emit({ ...signal, state: 'thinking' })
        }
      }
      const text = event.textOutput
      if (text) {
        const block = blocks.get(text.contentId)
        if (block?.final && (block.role === 'USER' || block.role === 'ASSISTANT')) {
          block.text = (block.text + text.content).slice(0, 32_768)
          options.onTranscript?.({
            contentId: text.contentId,
            role: block.role,
            text: block.text,
            final: false,
          })
        }
      }
      const end = event.contentEnd
      if (end?.stopReason?.toUpperCase() === 'INTERRUPTED') {
        playing = false
        turnFinished = false
        options.onInterrupt?.()
        emit({ ...signal, state: 'listening', outputVolume: 0 })
      }
      if (end) {
        const block = blocks.get(end.contentId)
        if (block?.final && (block.role === 'USER' || block.role === 'ASSISTANT')) {
          options.onTranscript?.({
            contentId: end.contentId,
            role: block.role,
            text: block.text,
            final: true,
          })
        }
        if (block?.role === 'USER' && !playing && end.stopReason !== 'INTERRUPTED') {
          emit({ ...signal, state: 'thinking' })
        }
        blocks.delete(end.contentId)
      }
      if (event.completionEnd) {
        turnFinished = true
        if (!playing) emit({ ...signal, state: 'listening', outputVolume: 0 })
      }
    },
    setInputVolume(sessionId, inputVolume) {
      if (sessionId !== currentSession || signal.state === 'error') return
      emit({ ...signal, inputVolume: volume(inputVolume) })
    },
    setPlayback(sessionId, active, outputVolume = 0) {
      if (sessionId !== currentSession || signal.state === 'error') return
      playing = active
      emit({
        ...signal,
        state: active ? 'speaking' : turnFinished ? 'listening' : signal.state,
        outputVolume: active ? volume(outputVolume) : 0,
      })
    },
    failed(sessionId, error) {
      if (sessionId !== currentSession) return
      options.onInterrupt?.()
      reset('error', error)
      currentSession = null
    },
    endSession(sessionId) {
      if (sessionId !== currentSession) return
      options.onInterrupt?.()
      currentSession = null
      reset('idle')
    },
  }
}
