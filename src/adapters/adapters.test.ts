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
    vi.useFakeTimers()
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

    client.emit('speech-end')
    expect(lastSignal(signals)).toMatchObject({
      volume: 0,
      outputVolume: 0,
    })

    vi.advanceTimersByTime(350)
    expect(lastSignal(signals)).toMatchObject({
      state: 'listening',
      volume: 0,
      outputVolume: 0,
    })

    const signalCount = signals.length
    unsubscribe()
    expect(cancelAnimationFrame).toHaveBeenCalled()

    animationFrame.flush()
    expect(signals).toHaveLength(signalCount)
  })

  it('keeps volume smoothing independent for each subscriber', () => {
    const animationFrame = installAnimationFrameStub()
    const client = new FakeVapiClient()
    const adapter = createVapiAdapter(client as unknown as VapiClientLike)
    const firstSignals: OrbSignal[] = []
    const secondSignals: OrbSignal[] = []

    const unsubscribeFirst = adapter.subscribe((signal) => firstSignals.push(signal))
    const unsubscribeSecond = adapter.subscribe((signal) => secondSignals.push(signal))

    client.emit('call-start')
    client.emit('speech-start')
    client.emit('volume-level', 1)
    animationFrame.flush()

    expect(lastSignal(firstSignals).outputVolume).toBeCloseTo(
      lastSignal(secondSignals).outputVolume ?? 0,
    )

    unsubscribeFirst()
    unsubscribeSecond()
  })

  it('keeps Vapi connecting signals after another subscriber unsubscribes', async () => {
    const client = new FakeVapiClient()
    const adapter = createVapiAdapter(client as unknown as VapiClientLike)
    const firstSignals: OrbSignal[] = []
    const secondSignals: OrbSignal[] = []

    const unsubscribeFirst = adapter.subscribe((signal) => firstSignals.push(signal))
    const unsubscribeSecond = adapter.subscribe((signal) => secondSignals.push(signal))

    unsubscribeFirst()
    await adapter.start?.()

    expect(firstSignals).toHaveLength(0)
    expect(lastSignal(secondSignals)).toMatchObject({ state: 'connecting' })
    expect(client.startMock).toHaveBeenCalledOnce()

    unsubscribeSecond()
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

  it('does not let a stale stop clear a newer ElevenLabs session', async () => {
    let resolveOldEndSession: (() => void) | undefined
    const sessionOptions: ElevenLabsStartSessionOptions[] = []
    const oldConversation: ElevenLabsConversation = {
      endSession: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveOldEndSession = resolve
          }),
      ),
      getInputVolume: () => 0,
      getOutputVolume: () => 0,
      getInputByteFrequencyData: () => new Uint8Array(),
      getOutputByteFrequencyData: () => new Uint8Array(),
    }
    const newConversation: ElevenLabsConversation = {
      endSession: vi.fn(async () => undefined),
      getInputVolume: () => 0,
      getOutputVolume: () => 0,
      getInputByteFrequencyData: () => new Uint8Array(),
      getOutputByteFrequencyData: () => new Uint8Array(),
    }
    const ConversationClass: ElevenLabsConversationClass = {
      startSession: vi.fn(async (options) => {
        sessionOptions.push(options)
        return sessionOptions.length === 1 ? oldConversation : newConversation
      }),
    }
    const adapter = createElevenLabsAdapter(ConversationClass, {
      agentId: 'agent-id',
    })
    const signals: OrbSignal[] = []

    adapter.subscribe((signal) => signals.push(signal))

    await adapter.start()
    sessionOptions[0]?.onConnect?.({ conversationId: 'old-conversation-id' })
    expect(lastSignal(signals)).toMatchObject({ state: 'listening' })

    const stopPromise = adapter.stop()
    expect(oldConversation.endSession).toHaveBeenCalledOnce()

    sessionOptions[0]?.onDisconnect?.({})
    expect(lastSignal(signals)).toMatchObject({ state: 'idle' })

    await adapter.start()
    sessionOptions[1]?.onConnect?.({ conversationId: 'new-conversation-id' })
    expect(lastSignal(signals)).toMatchObject({ state: 'listening' })

    resolveOldEndSession?.()
    await stopPromise

    expect(lastSignal(signals)).toMatchObject({ state: 'listening' })

    await adapter.stop()
    expect(newConversation.endSession).toHaveBeenCalledOnce()
  })

  it('cancels an in-flight ElevenLabs start when stopped while connecting', async () => {
    let sessionOptions: ElevenLabsStartSessionOptions | undefined
    let resolveStartSession: ((conversation: ElevenLabsConversation) => void) | undefined
    const conversation: ElevenLabsConversation = {
      endSession: vi.fn(async () => undefined),
      getInputVolume: () => 0,
      getOutputVolume: () => 0,
      getInputByteFrequencyData: () => new Uint8Array(),
      getOutputByteFrequencyData: () => new Uint8Array(),
    }
    const ConversationClass: ElevenLabsConversationClass = {
      startSession: vi.fn((options) => {
        sessionOptions = options
        return new Promise<ElevenLabsConversation>((resolve) => {
          resolveStartSession = resolve
        })
      }),
    }
    const adapter = createElevenLabsAdapter(ConversationClass, {
      agentId: 'agent-id',
    })
    const signals: OrbSignal[] = []

    adapter.subscribe((signal) => signals.push(signal))
    const startPromise = adapter.start()

    sessionOptions?.onStatusChange?.({ status: 'connecting' })
    expect(lastSignal(signals)).toMatchObject({ state: 'connecting' })

    const stopPromise = adapter.stop()
    expect(lastSignal(signals)).toMatchObject({ state: 'idle' })

    resolveStartSession?.(conversation)
    await startPromise
    await stopPromise

    expect(conversation.endSession).toHaveBeenCalledOnce()

    sessionOptions?.onConnect?.({ conversationId: 'stale-conversation-id' })
    expect(lastSignal(signals)).toMatchObject({ state: 'idle' })
  })

  it('replays state and restarts volume polling when resubscribing during a call', async () => {
    vi.useFakeTimers()

    let sessionOptions: ElevenLabsStartSessionOptions | undefined
    let inputVolume = 0.2
    const conversation: ElevenLabsConversation = {
      endSession: vi.fn(async () => undefined),
      getInputVolume: () => inputVolume,
      getOutputVolume: () => 0,
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
    const firstSignals: OrbSignal[] = []

    const unsubscribe = adapter.subscribe((signal) => firstSignals.push(signal))
    await adapter.start()
    sessionOptions?.onConnect?.({ conversationId: 'conversation-id' })
    vi.advanceTimersByTime(33)

    expect(lastSignal(firstSignals)).toMatchObject({
      state: 'listening',
      inputVolume: 0.4,
    })

    unsubscribe()
    inputVolume = 0.3

    const secondSignals: OrbSignal[] = []
    adapter.subscribe((signal) => secondSignals.push(signal))

    expect(lastSignal(secondSignals)).toMatchObject({
      state: 'listening',
      inputVolume: 0,
    })

    vi.advanceTimersByTime(33)

    expect(lastSignal(secondSignals)).toMatchObject({
      state: 'listening',
      inputVolume: 0.6,
    })
  })
})
