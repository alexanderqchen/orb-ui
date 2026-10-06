import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrbSignal } from '../types'
import { createAgoraAdapter, type AgoraSession } from './index'

class Events {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, listener: (...args: any[]) => void) {
    this.listeners.get(event)?.delete(listener)
  }
  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args))
  }
}

function fixture() {
  const toolkit = Object.assign(new Events(), { interrupt: vi.fn(async () => undefined) })
  const rtc = Object.assign(new Events(), { connectionState: 'CONNECTED' })
  const microphone = { enabled: true, getVolumeLevel: () => 0.25 }
  const audio = {
    isPlaying: true,
    level: 0,
    getVolumeLevel() {
      return this.level
    },
  }
  const close = vi.fn(async () => undefined)
  const session = {
    toolkit,
    rtc,
    agentUserId: 'agent-42',
    close,
    getMicrophoneTrack: () => microphone,
    getAgentAudioTrack: () => audio,
  } satisfies AgoraSession
  const createSession = vi.fn(async () => session)
  const adapter = createAgoraAdapter({ createSession })
  const signals: OrbSignal[] = []
  const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
  return {
    ...session,
    audio,
    microphone,
    createSession,
    adapter,
    signals,
    unsubscribe,
    last: () => signals.at(-1)!,
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Agora toolkit/RTC bridge (synthetic provider fixtures)', () => {
  it('deduplicates repeated start and reads the existing audio tracks', async () => {
    const f = fixture()
    const start = f.adapter.start()
    expect(f.adapter.start()).toBe(start)
    await start
    expect(f.last().state).toBe('listening')
    expect(f.last().inputVolume).toBeGreaterThan(0)
    expect(f.createSession).toHaveBeenCalledTimes(1)
    await f.adapter.stop()
    expect(f.close).toHaveBeenCalledTimes(1)
    expect(f.last()).toEqual({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    f.unsubscribe()
  })

  it('uses measured played audio instead of provider generation to show speaking', async () => {
    const f = fixture()
    await f.adapter.start()
    f.toolkit.emit('agent-thinking-changed', 'agent-42', true)
    expect(f.last().state).toBe('thinking')
    f.toolkit.emit('agent-thinking-changed', 'agent-42', false)
    f.toolkit.emit('agent-speaking-changed', 'agent-42', true)
    expect(f.last().state).toBe('thinking')
    f.audio.level = 0.4
    vi.advanceTimersByTime(40)
    expect(f.last().state).toBe('speaking')
    expect(f.last().outputVolume).toBeGreaterThan(0)
    f.audio.level = 0
    f.toolkit.emit('agent-speaking-changed', 'agent-42', false)
    vi.advanceTimersByTime(210)
    expect(f.last().state).toBe('listening')
    f.audio.level = 0.7
    f.audio.isPlaying = false
    vi.advanceTimersByTime(40)
    expect(f.last().state).toBe('listening')
    f.unsubscribe()
  })

  it('filters other participants and out-of-order aggregate state/interruption events', async () => {
    const f = fixture()
    await f.adapter.start()
    f.toolkit.emit('agent-thinking-changed', 'other-agent', true)
    expect(f.last().state).toBe('listening')
    const event = { state: 'thinking', turnID: 3, timestamp: 100, reason: 'llm' }
    f.toolkit.emit('agent-state-changed', 'agent-42', event)
    expect(f.last().state).toBe('thinking')
    f.toolkit.emit('agent-state-changed', 'agent-42', {
      ...event,
      state: 'listening',
      turnID: 2,
      timestamp: 110,
    })
    f.toolkit.emit('agent-interrupted', 'agent-42', { turnID: 3, timestamp: 99 })
    expect(f.last().state).toBe('thinking')
    f.toolkit.emit('agent-interrupted', 'agent-42', { turnID: 3, timestamp: 120 })
    f.audio.level = 0.7
    vi.advanceTimersByTime(40)
    expect(f.last().state).toBe('listening')
    expect(f.last().outputVolume).toBe(0)
    f.unsubscribe()
  })

  it('waits for the interruption event rather than assuming an RTM publish was handled', async () => {
    const f = fixture()
    await f.adapter.start()
    f.audio.level = 0.5
    vi.advanceTimersByTime(40)
    await f.adapter.interrupt()
    expect(f.toolkit.interrupt).toHaveBeenCalledWith('agent-42')
    expect(f.last().state).toBe('speaking')
    f.toolkit.emit('agent-interrupted', 'agent-42', { turnID: 1, timestamp: 100 })
    expect(f.last().state).toBe('listening')
    f.unsubscribe()
  })

  it('clears reconnect stale flags and removes callbacks on disconnect/error', async () => {
    const f = fixture()
    await f.adapter.start()
    f.toolkit.emit('agent-thinking-changed', 'agent-42', true)
    f.rtc.connectionState = 'RECONNECTING'
    f.rtc.emit('connection-state-change', 'RECONNECTING', 'CONNECTED')
    expect(f.last()).toEqual({ state: 'connecting', inputVolume: 0, outputVolume: 0 })
    f.toolkit.emit('agent-thinking-changed', 'agent-42', true)
    f.rtc.connectionState = 'CONNECTED'
    f.rtc.emit('connection-state-change', 'CONNECTED', 'RECONNECTING')
    expect(f.last().state).toBe('listening')
    const stale = [...f.toolkit.listeners.get('agent-thinking-changed')!][0]
    f.rtc.connectionState = 'DISCONNECTED'
    f.rtc.emit('connection-state-change', 'DISCONNECTED', 'CONNECTED')
    expect(f.last().state).toBe('error')
    await Promise.resolve()
    expect(f.close).toHaveBeenCalledTimes(1)
    const count = f.signals.length
    stale('agent-42', true)
    expect(f.signals).toHaveLength(count)
    expect([...f.toolkit.listeners.values()].every((listeners) => !listeners.size)).toBe(true)
    f.unsubscribe()
  })

  it('aborts permission/backend start and closes resources arriving after unmount', async () => {
    const f = fixture()
    let finish!: (session: AgoraSession) => void
    const createSession = vi.fn((signal: AbortSignal) => {
      expect(signal.aborted).toBe(false)
      return new Promise<AgoraSession>((resolve) => {
        finish = resolve
      })
    })
    const adapter = createAgoraAdapter({ createSession })
    const unsubscribe = adapter.subscribe(() => undefined)
    const start = adapter.start()
    const rejected = expect(start).rejects.toMatchObject({ name: 'AbortError' })
    unsubscribe()
    await rejected
    expect(createSession.mock.calls[0][0].aborted).toBe(true)
    finish(f)
    await Promise.resolve()
    expect(f.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    f.unsubscribe()
  })

  it('surfaces timeout and permissions failures with no capture or listener leak', async () => {
    const f = fixture()
    const adapter = createAgoraAdapter({
      createSession: () => new Promise(() => undefined),
      startTimeoutMs: 100,
    })
    const signals: OrbSignal[] = []
    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
    const start = adapter.start()
    const rejected = expect(start).rejects.toThrow('timed out')
    vi.advanceTimersByTime(101)
    await rejected
    expect(signals.at(-1)?.state).toBe('error')
    unsubscribe()
    f.createSession.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
    await expect(f.adapter.start()).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(f.last().state).toBe('error')
    f.unsubscribe()
  })

  it('permits immediate stop/start and does not let old cleanup overwrite the new signal', async () => {
    const old = fixture()
    const next = fixture()
    let close!: () => void
    old.close.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          close = resolve
        }),
    )
    let count = 0
    const adapter = createAgoraAdapter({ createSession: async () => (++count === 1 ? old : next) })
    const signals: OrbSignal[] = []
    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
    await adapter.start()
    const stopping = adapter.stop()
    await Promise.resolve()
    await adapter.start()
    close()
    await stopping
    expect(signals.at(-1)?.state).toBe('listening')
    expect(count).toBe(2)
    unsubscribe()
    old.unsubscribe()
    next.unsubscribe()
  })
})
