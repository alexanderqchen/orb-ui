import { describe, expect, it, vi } from 'vitest'
import { createHumeAdapter, humeFftToVolume, humeVoiceToOrbSignal } from './index'
import type { HumeSessionBridge, HumeVoiceSnapshot } from './index'
import type { OrbSignal } from '../types'

const connected: HumeVoiceSnapshot = {
  status: { value: 'connected' },
  isPlaying: false,
  micFft: [0.6, 0.6],
  playerFft: [1.6, 1.6],
}

describe('Hume controlled bridge', () => {
  it('observes SDK playback and directional FFT without opening another audio session', () => {
    expect(humeVoiceToOrbSignal(connected)).toEqual({
      state: 'listening',
      inputVolume: 0.3,
      outputVolume: 0,
    })
    expect(humeVoiceToOrbSignal({ ...connected, isPlaying: true })).toEqual({
      state: 'speaking',
      inputVolume: 0.3,
      outputVolume: 0.8,
    })
    expect(humeVoiceToOrbSignal({ ...connected, isThinking: true }).state).toBe('thinking')
    expect(humeVoiceToOrbSignal({ ...connected, isPlaying: true, isThinking: true }).state).toBe(
      'speaking',
    )
    expect(
      humeVoiceToOrbSignal({
        ...connected,
        isPlaying: true,
        isMuted: true,
        isAudioMuted: true,
      }),
    ).toEqual({ state: 'listening', inputVolume: 0, outputVolume: 0 })
  })

  it('clamps malformed frequency snapshots and clears envelopes for terminal states', () => {
    expect(humeFftToVolume([NaN, Infinity, -0.2, 2])).toBe(0.5)
    expect(humeFftToVolume([])).toBe(0)
    expect(humeVoiceToOrbSignal({ ...connected, status: { value: 'disconnected' } })).toEqual({
      state: 'idle',
      inputVolume: 0,
      outputVolume: 0,
    })
    const error = new Error('mic_permission_denied')
    expect(humeVoiceToOrbSignal({ ...connected, error })).toEqual({
      state: 'error',
      inputVolume: 0,
      outputVolume: 0,
      error,
    })
  })

  it('treats generation separately from playback, and clears a barge-in before the next render', () => {
    const adapter = createHumeAdapter()
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))
    const session = adapter.createSession()
    session.observe(connected)
    session.onMessage({ type: 'assistant_message' })
    expect(signals.at(-1)?.state).toBe('listening')
    session.onMessage({ type: 'user_message', interim: true })
    expect(signals.at(-1)?.state).toBe('listening')
    session.onMessage({ type: 'user_message', interim: false })
    expect(signals.at(-1)?.state).toBe('thinking')
    session.observe({ ...connected, isPlaying: true })
    session.onMessage({ type: 'assistant_end' })
    expect(signals.at(-1)?.state).toBe('speaking')
    session.onInterruption()
    expect(signals.at(-1)).toMatchObject({ state: 'listening', outputVolume: 0 })
    session.observe({ ...connected, isPlaying: true })
    expect(signals.at(-1)?.state).toBe('listening')
    session.observe(connected)
    session.observe({ ...connected, isPlaying: true })
    expect(signals.at(-1)?.state).toBe('speaking')
  })

  it('isolates reconnects and terminal errors from old session callbacks and snapshots', () => {
    const adapter = createHumeAdapter()
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))
    const previous = adapter.createSession()
    previous.observe(connected)
    const current = adapter.createSession()
    current.observe(connected)
    const count = signals.length
    previous.observe({ ...connected, isPlaying: true })
    previous.onError(new Error('stale socket error'))
    previous.close()
    expect(signals).toHaveLength(count)
    current.onError(new Error('current socket error'))
    current.observe({ ...connected, isPlaying: true })
    current.close()
    expect(signals.at(-1)?.state).toBe('error')
  })

  it('removes subscriptions without touching VoiceProvider ownership', () => {
    const disconnect = vi.fn()
    const adapter = createHumeAdapter({ disconnect })
    const listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)
    const session = adapter.createSession()
    unsubscribe()
    const count = listener.mock.calls.length
    session.observe(connected)
    expect(listener).toHaveBeenCalledTimes(count)
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('coalesces optional lifecycle and aborts old sessions during stop/reconnect', async () => {
    let session: HumeSessionBridge | undefined
    let abort: AbortSignal | undefined
    let finish!: () => void
    const disconnect = vi.fn(async () => undefined)
    const connect = vi.fn((bridge: HumeSessionBridge, signal: AbortSignal) => {
      session = bridge
      abort = signal
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    const adapter = createHumeAdapter({ connect, disconnect })
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))
    const first = adapter.start!()
    expect(adapter.start!()).toBe(first)
    await adapter.stop()
    expect(abort?.aborted).toBe(true)
    session?.observe({ ...connected, isPlaying: true })
    expect(signals.at(-1)?.state).toBe('idle')
    finish()
    await first
    const second = adapter.start!()
    session?.observe(connected)
    finish()
    await second
    expect(signals.at(-1)?.state).toBe('listening')
    expect(connect).toHaveBeenCalledTimes(2)
    await adapter.stop()
    expect(disconnect).toHaveBeenCalledTimes(2)
  })

  it('cleans a failed optional connection and preserves its visible error', async () => {
    const error = new Error('Hume microphone permission denied')
    const disconnect = vi.fn(async () => undefined)
    const adapter = createHumeAdapter({
      connect: async () => {
        throw error
      },
      disconnect,
    })
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))
    await expect(adapter.start!()).rejects.toBe(error)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(signals.at(-1)).toMatchObject({ state: 'error', error, inputVolume: 0, outputVolume: 0 })
  })
})
