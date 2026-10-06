import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrbSignal } from '../types'
import {
  createDeepgramAdapter,
  createDeepgramReactAdapter,
  type DeepgramReactSnapshot,
  type DeepgramResources,
} from './index'

class Events {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  // Provider EventEmitter accepts payload-specific functions; fixtures keep arbitrary events.
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
  const session = Object.assign(new Events(), {
    state: 'idle' as const,
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    sendAudio: vi.fn(),
  })
  const microphone = Object.assign(new Events(), {
    muted: false,
    level: 0.3,
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    getInputVolume() {
      return this.level
    },
  })
  const player = {
    muted: false,
    remaining: 0,
    level: 0,
    queue: vi.fn(),
    interrupt: vi.fn(() => {
      player.remaining = 0
      player.level = 0
    }),
    dispose: vi.fn(),
    getRemainingPlaybackTime: () => player.remaining,
    getOutputVolume: () => player.level,
  }
  const resources = { session, microphone, player } satisfies DeepgramResources
  const adapter = createDeepgramAdapter({ createResources: () => resources })
  const signals: OrbSignal[] = []
  const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
  return { ...resources, adapter, signals, unsubscribe, last: () => signals.at(-1)! }
}

async function ready(f: ReturnType<typeof fixture>) {
  const start = f.adapter.start()
  f.session.emit('settings-applied', { type: 'SettingsApplied' })
  await start
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Deepgram browser adapter (synthetic protocol/audio fixtures)', () => {
  it('waits for SettingsApplied and microphone permission; start is idempotent', async () => {
    const f = fixture()
    const start = f.adapter.start()
    expect(f.adapter.start()).toBe(start)
    f.session.emit('connected')
    await Promise.resolve()
    expect(f.last().state).toBe('connecting')
    f.session.emit('settings-applied')
    await start
    expect(f.last().state).toBe('listening')
    expect(f.microphone.start).toHaveBeenCalledTimes(1)
    f.unsubscribe()
  })

  it('shows playback only after measured audio and retains the queue tail after audio-done', async () => {
    const f = fixture()
    await ready(f)
    f.session.emit('agent-thinking')
    expect(f.last().state).toBe('thinking')
    f.session.emit('agent-started-speaking')
    expect(f.last().state).toBe('thinking')
    f.player.remaining = 0.5
    f.player.level = 0.4
    f.session.emit('audio', new ArrayBuffer(64))
    expect(f.player.queue).toHaveBeenCalledTimes(1)
    expect(f.last().state).toBe('speaking')
    f.session.emit('agent-audio-done')
    expect(f.last().state).toBe('speaking')
    f.player.remaining = 0
    f.player.level = 0
    vi.advanceTimersByTime(40)
    expect(f.last().state).toBe('listening')
    expect(f.last().outputVolume).toBe(0)
    f.unsubscribe()
  })

  it('interrupts the player and drops late audio until a new agent turn', async () => {
    const f = fixture()
    await ready(f)
    f.player.remaining = 1
    f.player.level = 0.5
    f.session.emit('audio', new ArrayBuffer(64))
    f.session.emit('user-started-speaking')
    expect(f.player.interrupt).toHaveBeenCalledTimes(1)
    expect(f.last().state).toBe('listening')
    f.session.emit('audio', new ArrayBuffer(64))
    expect(f.player.queue).toHaveBeenCalledTimes(1)
    f.session.emit('agent-thinking')
    f.session.emit('audio', new ArrayBuffer(64))
    expect(f.player.queue).toHaveBeenCalledTimes(2)
    f.unsubscribe()
  })

  it('clears stale playback and errors on reconnect, then requires settings again', async () => {
    const f = fixture()
    await ready(f)
    const error = new Error('socket failed')
    f.session.emit('sdk-error', error)
    expect(f.last()).toMatchObject({ state: 'error', error })
    f.session.emit('reconnecting', 1, 500)
    expect(f.last()).toEqual({ state: 'connecting', inputVolume: 0, outputVolume: 0 })
    f.session.emit('agent-thinking')
    expect(f.last().state).toBe('connecting')
    f.session.emit('settings-applied')
    expect(f.last().state).toBe('listening')
    f.unsubscribe()
  })

  it('releases a microphone whose permission resolves after stop', async () => {
    const f = fixture()
    let grant!: () => void
    f.microphone.start.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          grant = resolve
        }),
    )
    const start = f.adapter.start()
    const rejected = expect(start).rejects.toMatchObject({ name: 'AbortError' })
    f.adapter.stop()
    await rejected
    grant()
    await Promise.resolve()
    expect(f.microphone.stop).toHaveBeenCalledTimes(2)
    expect(f.last().state).toBe('idle')
    expect(f.session.disconnect).toHaveBeenCalledTimes(1)
    f.unsubscribe()
  })

  it('surfaces permission and provider errors, closes all resources, and removes listeners', async () => {
    const f = fixture()
    const error = new DOMException('Permission denied', 'NotAllowedError')
    f.microphone.start.mockRejectedValue(error)
    await expect(f.adapter.start()).rejects.toBe(error)
    expect(f.last()).toMatchObject({ state: 'error', error, inputVolume: 0, outputVolume: 0 })
    expect(f.player.dispose).toHaveBeenCalledTimes(1)
    expect([...f.session.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true)
    f.unsubscribe()
  })

  it('times out readiness and ignores captured old callbacks after unmount', async () => {
    const f = fixture()
    const start = f.adapter.start()
    const stale = [...f.session.listeners.get('agent-thinking')!][0]
    const rejected = expect(start).rejects.toThrow('timed out')
    vi.advanceTimersByTime(30_001)
    await rejected
    f.unsubscribe()
    const count = f.signals.length
    stale()
    expect(f.signals).toHaveLength(count)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('supports an immediate stop/start with fresh resources and isolates old events', async () => {
    const old = fixture()
    const next = fixture()
    let count = 0
    const adapter = createDeepgramAdapter({ createResources: () => (++count === 1 ? old : next) })
    const signals: OrbSignal[] = []
    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
    const first = adapter.start()
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const stale = [...old.session.listeners.get('settings-applied')!].at(-1)!
    adapter.stop()
    const second = adapter.start()
    await rejected
    stale()
    expect(signals.at(-1)?.state).toBe('connecting')
    next.session.emit('settings-applied')
    await second
    expect(count).toBe(2)
    unsubscribe()
    old.unsubscribe()
    next.unsubscribe()
  })
})

describe('Deepgram React provider observer', () => {
  it('does not turn the provider speaking mode into audible playback before a meter sample', () => {
    let level = 0
    const snapshot: DeepgramReactSnapshot = {
      state: 'connected',
      mode: 'speaking',
      micActive: true,
      micMuted: false,
      outputMuted: false,
      getInputVolume: () => 0.2,
      getOutputVolume: () => level,
    }
    const adapter = createDeepgramReactAdapter({
      getSnapshot: () => snapshot,
      start: async () => undefined,
      stop: () => undefined,
    })
    const signals: OrbSignal[] = []
    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
    expect(signals.at(-1)?.state).toBe('thinking')
    level = 0.5
    vi.advanceTimersByTime(40)
    expect(signals.at(-1)?.state).toBe('speaking')
    level = 0
    vi.advanceTimersByTime(40)
    expect(signals.at(-1)?.state).toBe('speaking') // Provider preserves playback queue tail.
    snapshot.mode = 'listening'
    vi.advanceTimersByTime(40)
    expect(signals.at(-1)?.state).toBe('listening')
    unsubscribe()
  })

  it('reads the existing provider, honors mute/reconnect, and leaves audio ownership with it', async () => {
    let snapshot: DeepgramReactSnapshot = {
      state: 'connected',
      mode: 'speaking',
      micActive: true,
      micMuted: false,
      outputMuted: false,
      getInputVolume: () => 0.4,
      getOutputVolume: () => 0.7,
    }
    const stop = vi.fn()
    const start = vi.fn(async () => undefined)
    const adapter = createDeepgramReactAdapter({ getSnapshot: () => snapshot, start, stop })
    const signals: OrbSignal[] = []
    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
    expect(signals.at(-1)).toEqual({ state: 'speaking', inputVolume: 0.4, outputVolume: 0.7 })
    snapshot = { ...snapshot, outputMuted: true, micMuted: true }
    vi.advanceTimersByTime(40)
    expect(signals.at(-1)).toEqual({ state: 'listening', inputVolume: 0, outputVolume: 0 })
    snapshot = { ...snapshot, state: 'reconnecting' }
    vi.advanceTimersByTime(40)
    expect(signals.at(-1)?.state).toBe('connecting')
    const pending = adapter.start!()
    expect(start).toHaveBeenCalledTimes(1) // Runs within user gesture.
    await pending
    unsubscribe()
    expect(stop).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a rejected old start after stop and retry', async () => {
    const snapshot: DeepgramReactSnapshot = {
      state: 'idle',
      mode: 'idle',
      micActive: false,
      micMuted: false,
      outputMuted: false,
      getInputVolume: () => 0,
      getOutputVolume: () => 0,
    }
    let reject!: (error: Error) => void
    const start = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, fail) => {
            reject = fail
          }),
      )
      .mockResolvedValue(undefined)
    const adapter = createDeepgramReactAdapter({
      getSnapshot: () => snapshot,
      start,
      stop: vi.fn(),
    })
    const signals: OrbSignal[] = []
    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
    const first = adapter.start!() as Promise<void>
    const rejected = expect(first).rejects.toThrow('old')
    adapter.stop!()
    await adapter.start!()
    reject(new Error('old'))
    await rejected
    expect(signals.at(-1)?.state).toBe('idle')
    unsubscribe()
  })
})
