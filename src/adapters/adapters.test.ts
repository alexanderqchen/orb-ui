import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElevenLabsAdapter, createVapiAdapter } from './index'
import type {
  ElevenLabsConversation,
  ElevenLabsConversationClass,
  ElevenLabsStartSessionOptions,
} from './elevenlabs'
import type { OrbSignal } from './types'

type VapiClientLike = Parameters<typeof createVapiAdapter>[0]

class FakeVapiClient {
  startMock = vi.fn(async () => undefined)
  start = this.startMock
  stop = vi.fn()
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  removeListener(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener)
  }

  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args))
  }
}

function lastSignal(signals: OrbSignal[]) {
  return signals[signals.length - 1]
}

function installAnimationFrameStub() {
  let id = 0
  const callbacks = new Map<number, FrameRequestCallback>()

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      id += 1
      callbacks.set(id, callback)
      return id
    }),
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((animationFrameId: number) => {
      callbacks.delete(animationFrameId)
    }),
  )

  return {
    flush() {
      const pending = [...callbacks.entries()]
      callbacks.clear()
      pending.forEach(([, callback]) => callback(performance.now()))
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Vapi adapter signals', () => {
  it('emits output volume while speaking and cancels interpolation on unsubscribe', async () => {
    const animationFrame = installAnimationFrameStub()
    const client = new FakeVapiClient()
    const adapter = createVapiAdapter(client as unknown as VapiClientLike, {
      assistantId: 'assistant-id',
    })
    const signals: OrbSignal[] = []

    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))

    await adapter.start?.()
    expect(lastSignal(signals)).toMatchObject({ state: 'connecting' })
    expect(client.startMock).toHaveBeenCalledWith('assistant-id')

    client.emit('call-start')
    expect(lastSignal(signals)).toMatchObject({ state: 'listening', outputVolume: 0 })

    client.emit('speech-start')
    client.emit('volume-level', 1)
    animationFrame.flush()

    expect(lastSignal(signals).state).toBe('speaking')
    expect(lastSignal(signals).outputVolume).toBeGreaterThan(0)

    const signalCount = signals.length
    unsubscribe()
    expect(cancelAnimationFrame).toHaveBeenCalled()

    animationFrame.flush()
    expect(signals).toHaveLength(signalCount)
  })
})

describe('ElevenLabs adapter signals', () => {
  it('emits input and output volumes separately, then returns to idle on stop', async () => {
    vi.useFakeTimers()

    let sessionOptions: ElevenLabsStartSessionOptions | undefined
    const conversation: ElevenLabsConversation = {
      endSession: vi.fn(async () => undefined),
      getInputVolume: () => 0.2,
      getOutputVolume: () => 0.4,
      getInputByteFrequencyData: () => new Uint8Array(),
      getOutputByteFrequencyData: () => new Uint8Array(),
    }
    const ConversationClass: ElevenLabsConversationClass = {
      startSession: vi.fn(async (options) => {
        sessionOptions = options
        return conversation
      }),
    }
    const adapter = createElevenLabsAdapter(ConversationClass, {
      agentId: 'agent-id',
    })
    const signals: OrbSignal[] = []

    adapter.subscribe((signal) => signals.push(signal))
    await adapter.start()

    sessionOptions?.onStatusChange?.({ status: 'connecting' })
    expect(lastSignal(signals)).toMatchObject({ state: 'connecting' })

    sessionOptions?.onConnect?.({ conversationId: 'conversation-id' })
    vi.advanceTimersByTime(33)

    expect(lastSignal(signals)).toMatchObject({
      state: 'listening',
      volume: 0.4,
      inputVolume: 0.4,
    })

    sessionOptions?.onModeChange?.({ mode: 'speaking' })
    vi.advanceTimersByTime(33)

    expect(lastSignal(signals)).toMatchObject({
      state: 'speaking',
      volume: 0.8,
      outputVolume: 0.8,
    })

    await adapter.stop()

    expect(conversation.endSession).toHaveBeenCalledOnce()
    expect(lastSignal(signals)).toMatchObject({
      state: 'idle',
      volume: 0,
      inputVolume: 0,
      outputVolume: 0,
    })
  })
})
