import { describe, expect, it, vi } from 'vitest'
import { createPipecatAdapter } from './index'
import type { OrbSignal } from '../types'

type Listener = (...args: unknown[]) => void

class FakePipecatClient {
  state = 'disconnected'
  connect = vi.fn(async () => undefined)
  disconnect = vi.fn(async () => undefined)
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
}

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
      volume: 0.35,
      inputVolume: 0.35,
      outputVolume: 0,
    })

    client.emit('userStoppedSpeaking')
    expect(signals.at(-1)).toMatchObject({ state: 'thinking' })

    client.emit('botStartedSpeaking')
    client.emit('remoteAudioLevel', 0.7, { id: 'bot', local: false })
    expect(signals.at(-1)).toMatchObject({
      state: 'speaking',
      volume: 0.7,
      inputVolume: 0,
      outputVolume: 0.7,
    })

    client.emit('botStoppedSpeaking')
    expect(signals.at(-1)).toMatchObject({ state: 'listening', outputVolume: 0 })

    await adapter.stop()
    expect(client.disconnect).toHaveBeenCalledOnce()
    expect(signals.at(-1)).toMatchObject({ state: 'idle' })

    unsubscribe()
    expect(client.listenerCount('botReady')).toBe(0)
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
    expect(signals.at(-1)?.outputVolume).toBe(0.8)
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
