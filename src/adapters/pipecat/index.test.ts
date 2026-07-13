import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPipecatAdapter } from './index'
import type { OrbSignal } from '../types'

type Listener = (...args: unknown[]) => void

class FakePipecatClient {
  state = 'disconnected'
  connect = vi.fn(async () => undefined)
  disconnect = vi.fn(async () => undefined)
  trackSet?: {
    local?: { audio?: MediaStreamTrack }
    bot?: { audio?: MediaStreamTrack }
  }
  private listeners = new Map<string, Set<Listener>>()

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener)
  }

  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args))
  }

  listenerCount(event: string) {
    return this.listeners.get(event)?.size ?? 0
  }

  tracks() {
    return this.trackSet ?? {}
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running'
  private sample: number
  source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  analyser = {
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(this.sample),
  }
  createMediaStreamSource = vi.fn(() => this.source)
  createAnalyser = vi.fn(() => this.analyser)
  resume = vi.fn(async () => undefined)
  close = vi.fn(async () => {
    this.state = 'closed'
  })

  constructor(sample: number) {
    this.sample = sample
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createPipecatAdapter', () => {
  it('normalizes RTVI lifecycle, speaking, and audio-level events', async () => {
    const client = new FakePipecatClient()
    const connect = vi.fn(async () => undefined)
    const adapter = createPipecatAdapter(client, { connect })
    const signals: OrbSignal[] = []
    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))

    await adapter.start()
    expect(connect).toHaveBeenCalledOnce()
    expect(signals.at(-1)).toMatchObject({ state: 'connecting' })

    client.emit('botReady', { version: '1.0' })
    client.emit('localAudioLevel', 0.35)
    expect(signals.at(-1)).toMatchObject({
      state: 'listening',
      outputVolume: 0,
    })
    expect(signals.at(-1)?.volume).toBeCloseTo(0.6)
    expect(signals.at(-1)?.inputVolume).toBeCloseTo(0.6)

    client.emit('userStoppedSpeaking')
    expect(signals.at(-1)).toMatchObject({ state: 'thinking' })

    client.emit('botStartedSpeaking')
    client.emit('remoteAudioLevel', 0.7, { id: 'bot', local: false })
    expect(signals.at(-1)).toMatchObject({
      state: 'speaking',
      inputVolume: 0,
    })
    expect(signals.at(-1)?.volume).toBeCloseTo(0.5)
    expect(signals.at(-1)?.outputVolume).toBeCloseTo(0.5)

    client.emit('botStoppedSpeaking')
    expect(signals.at(-1)).toMatchObject({ state: 'listening', outputVolume: 0 })

    await adapter.stop()
    expect(client.disconnect).toHaveBeenCalledOnce()
    expect(signals.at(-1)).toMatchObject({ state: 'idle' })

    unsubscribe()
    expect(client.listenerCount('botReady')).toBe(0)
  })

  it('meters local and bot media tracks when transport audio-level events are unavailable', () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'MediaStream',
      class MediaStream {
        constructor() {}
      },
    )

    const localTrack = { kind: 'audio' } as MediaStreamTrack
    const botTrack = { kind: 'audio' } as MediaStreamTrack
    const client = new FakePipecatClient()
    client.trackSet = {
      local: { audio: localTrack },
      bot: { audio: botTrack },
    }
    const inputContext = new FakeAudioContext(0.08)
    const outputContext = new FakeAudioContext(0.16)
    const contexts = [inputContext, outputContext]
    const onOutputVolumeSample = vi.fn()
    const adapter = createPipecatAdapter(client, {
      createAudioContext: () => contexts.shift() as unknown as AudioContext,
      onOutputVolumeSample,
    })
    const signals: OrbSignal[] = []
    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))

    client.emit('botReady')
    vi.advanceTimersByTime(33)
    expect(signals.at(-1)).toMatchObject({ state: 'listening', outputVolume: 0 })
    expect(signals.at(-1)?.inputVolume).toBeGreaterThan(0)

    client.emit('botStartedSpeaking')
    vi.advanceTimersByTime(33)
    expect(signals.at(-1)).toMatchObject({ state: 'speaking', inputVolume: 0 })
    expect(signals.at(-1)?.outputVolume).toBeGreaterThan(0)
    expect(onOutputVolumeSample).toHaveBeenCalledWith(
      expect.objectContaining({ raw: expect.closeTo(0.16) }),
    )

    unsubscribe()
    expect(inputContext.close).toHaveBeenCalledOnce()
    expect(outputContext.close).toHaveBeenCalledOnce()
  })

  it('filters local and non-bot participant volume', () => {
    const client = new FakePipecatClient()
    const adapter = createPipecatAdapter(client, {
      isBotParticipant: (participant) => participant.id === 'bot',
    })
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))

    client.emit('botStartedSpeaking')
    const count = signals.length
    client.emit('remoteAudioLevel', 0.8, { id: 'local', local: true })
    client.emit('remoteAudioLevel', 0.8, { id: 'guest', local: false })
    expect(signals).toHaveLength(count)

    client.emit('remoteAudioLevel', 0.8, { id: 'bot', local: false })
    expect(signals.at(-1)?.outputVolume).toBeCloseTo(0.5)
  })

  it('amplifies realistic low levels and smooths attack and release independently', () => {
    const client = new FakePipecatClient()
    const adapter = createPipecatAdapter(client)
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))

    client.emit('botReady')
    client.emit('localAudioLevel', 0.02)
    const firstInput = signals.at(-1)?.inputVolume ?? 0
    expect(firstInput).toBeGreaterThan(0.07)

    client.emit('localAudioLevel', 0.02)
    const secondInput = signals.at(-1)?.inputVolume ?? 0
    expect(secondInput).toBeGreaterThan(firstInput)

    client.emit('localAudioLevel', 0)
    const releasedInput = signals.at(-1)?.inputVolume ?? 0
    expect(releasedInput).toBeLessThan(secondInput)
    expect(releasedInput).toBeGreaterThan(0)

    client.emit('botStartedSpeaking')
    client.emit('remoteAudioLevel', 0.05, { id: 'bot', local: false })
    const output = signals.at(-1)?.outputVolume ?? 0
    expect(output).toBeGreaterThan(0.15)
    expect(signals.at(-1)?.inputVolume).toBe(0)
  })

  it('gates invalid and near-silent levels', () => {
    const client = new FakePipecatClient()
    const adapter = createPipecatAdapter(client)
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))

    client.emit('botReady')
    client.emit('localAudioLevel', Number.NaN)
    expect(signals.at(-1)?.inputVolume).toBe(0)

    client.emit('localAudioLevel', 0.002)
    expect(signals.at(-1)?.inputVolume).toBe(0)
  })

  it('emits errors from the client and failed starts', async () => {
    const client = new FakePipecatClient()
    const startError = new Error('connection failed')
    const adapter = createPipecatAdapter(client, {
      connect: async () => {
        throw startError
      },
    })
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))

    await expect(adapter.start()).rejects.toThrow('connection failed')
    expect(signals.at(-1)).toMatchObject({ state: 'error', error: startError })

    const runtimeError = { data: { message: 'bot failed', fatal: true } }
    client.emit('error', runtimeError)
    expect(signals.at(-1)).toMatchObject({ state: 'error', error: runtimeError })
  })
})
