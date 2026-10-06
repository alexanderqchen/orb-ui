import { describe, expect, it, vi } from 'vitest'
import { createRetellAdapter } from './index'
import type { RetellClientLike, RetellWebCallOptions, RetellWebCallSession } from './index'
import type { OrbSignal } from '../types'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function fixture() {
  const calls: Array<{
    options: RetellWebCallOptions
    session: RetellWebCallSession
    ready: ReturnType<typeof deferred<void>>
  }> = []
  const client: RetellClientLike = {
    createWebCall: vi.fn((options) => {
      const ready = deferred<void>()
      const session: RetellWebCallSession = {
        status: 'connecting',
        analyzerComponent: { analyser: { context: { state: 'running' } } },
        ready: ready.promise,
        end: vi.fn(async () => {
          session.status = 'ended'
          options.hooks?.onStatus?.('ended')
          options.hooks?.onEnd?.({ disconnection_reason: 'user_hangup' })
          ready.resolve()
        }),
        startAudioPlayback: vi.fn(async () => undefined),
      }
      calls.push({ options, session, ready })
      return session
    }),
  }
  const adapter = createRetellAdapter(client, {
    getCallOptions: () => ({ agent_id: 'fixture-agent' }),
    outputVolumeCalibration: {
      amplitude: { silenceFloor: 0, speechReference: 0.5, speechPeak: 1 },
      envelope: { riseTimeMs: 0, fallTimeMs: 0 },
    },
  })
  const signals: OrbSignal[] = []
  const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
  const last = () => signals[signals.length - 1]
  async function live() {
    const starting = adapter.start()
    await Promise.resolve()
    const call = calls[calls.length - 1]
    call.session.status = 'live'
    call.options.hooks?.onStatus?.('live')
    call.ready.resolve()
    await starting
    return call
  }
  return { adapter, calls, signals, unsubscribe, last, live, client }
}

describe('current Retell WebCall adapter', () => {
  it('estimates output activity from supported audio snapshots, with a short decay and scoped app turns', async () => {
    vi.useFakeTimers()
    const { adapter, live, last } = fixture()
    try {
      const { options } = await live()
      const observe = adapter.getTurnObserver()
      expect(options.audio?.emitRawAudioSamples).toBe(true)
      expect(last().state).toBe('listening')
      observe('thinking')
      expect(last().state).toBe('thinking')
      options.hooks?.onAudio?.(Float32Array.from([0.5, -0.5]))
      expect(last()).toMatchObject({ state: 'speaking', outputVolume: 0.5, inputVolume: 0 })
      observe('thinking')
      expect(last().state).toBe('speaking')
      observe('interrupted')
      expect(last()).toMatchObject({ state: 'listening', outputVolume: 0 })
      options.hooks?.onAudio?.(Float32Array.from([0.8, -0.8]))
      expect(last().state).toBe('listening')
      options.hooks?.onAudio?.(new Float32Array(2))
      options.hooks?.onAudio?.(Float32Array.from([0.5, -0.5]))
      expect(last().state).toBe('speaking')
      vi.advanceTimersByTime(181)
      expect(last()).toMatchObject({ state: 'listening', outputVolume: 0 })
      await adapter.stop()
      observe('thinking')
      expect(last().state).toBe('idle')
    } finally {
      vi.useRealTimers()
    }
  })

  it('gates output activity on actual running audio playback and handles empty/malformed samples', async () => {
    const { adapter, live, last } = fixture()
    const { options, session } = await live()
    session.analyzerComponent!.analyser.context.state = 'suspended'
    options.hooks?.onAudio?.(Float32Array.from([0.5, -0.5]))
    expect(last()).toMatchObject({ state: 'listening', outputVolume: 0 })
    session.analyzerComponent!.analyser.context.state = 'running'
    options.hooks?.onAudio?.(Float32Array.from([NaN, Infinity]))
    options.hooks?.onAudio?.(new Float32Array())
    expect(last()).toMatchObject({ state: 'listening', outputVolume: 0 })
    options.hooks?.onAudio?.(Float32Array.from([0.5, -0.5]))
    expect(last().state).toBe('speaking')
    session.analyzerComponent!.analyser.context.state = 'suspended'
    options.hooks?.onAudio?.(Float32Array.from([0.5, -0.5]))
    expect(last()).toMatchObject({ state: 'listening', outputVolume: 0 })
    await adapter.stop()
  })

  it('coalesces repeated start/stop, rejects stale hooks, and restarts with fresh options', async () => {
    const { adapter, calls, signals, last } = fixture()
    const starting = adapter.start()
    expect(adapter.start()).toBe(starting)
    await Promise.resolve()
    const first = calls[0]
    const stopping = adapter.stop()
    expect(adapter.stop()).toBe(stopping)
    await stopping
    await starting
    const count = signals.length
    first.options.hooks?.onAudio?.(Float32Array.from([0.5, -0.5]))
    first.options.hooks?.onError?.(new Error('late'))
    expect(signals).toHaveLength(count)
    expect(last().state).toBe('idle')
    const restarted = adapter.start()
    await Promise.resolve()
    expect(calls).toHaveLength(2)
    calls[1].options.hooks?.onStatus?.('live')
    calls[1].ready.resolve()
    await restarted
    expect(last()).toMatchObject({ state: 'listening', outputVolume: 0 })
  })

  it('aborts delayed credentials and permits a fresh start before the old request resolves', async () => {
    const pending = deferred<RetellWebCallOptions>()
    const createWebCall = vi.fn()
    let abort: AbortSignal | undefined
    const adapter = createRetellAdapter(
      { createWebCall },
      {
        getCallOptions: vi.fn((signal) => {
          abort = signal
          return pending.promise
        }),
      },
    )
    const starting = adapter.start()
    await adapter.stop()
    expect(abort?.aborted).toBe(true)
    pending.resolve({ agent_id: 'old-agent' })
    await starting
    expect(createWebCall).not.toHaveBeenCalled()
  })

  it('preserves microphone errors after the SDK error/status/end sequence and rejects start', async () => {
    const { adapter, calls, last } = fixture()
    const starting = adapter.start()
    await Promise.resolve()
    const error = new Error('Microphone permission denied')
    calls[0].options.hooks?.onError?.(error)
    calls[0].options.hooks?.onStatus?.('ended')
    calls[0].options.hooks?.onEnd?.({})
    calls[0].ready.reject(error)
    await expect(starting).rejects.toBe(error)
    expect(last()).toMatchObject({ state: 'error', error, inputVolume: 0, outputVolume: 0 })
  })

  it('releases transport on a failed ready promise and resets on a deliberate stop', async () => {
    const { adapter, calls, last } = fixture()
    const starting = adapter.start()
    await Promise.resolve()
    const error = new Error('Audio connection failed')
    calls[0].ready.reject(error)
    await expect(starting).rejects.toBe(error)
    expect(calls[0].session.end).toHaveBeenCalledOnce()
    expect(last().state).toBe('error')
    await adapter.stop()
    expect(last().state).toBe('idle')
  })

  it('ends owned audio on final unsubscribe and leaves a stopped session inert', async () => {
    const { live, adapter, unsubscribe, client } = fixture()
    const call = await live()
    const other = adapter.subscribe(() => undefined)
    unsubscribe()
    expect(call.session.end).not.toHaveBeenCalled()
    other()
    expect(call.session.end).toHaveBeenCalledOnce()
    expect(client.createWebCall).toHaveBeenCalledOnce()
  })

  it('reports playback failure and allows an explicit user-gesture retry', async () => {
    const { live, adapter, last } = fixture()
    const call = await live()
    const error = new Error('Playback is blocked')
    vi.mocked(call.session.startAudioPlayback).mockRejectedValueOnce(error)
    await expect(adapter.resumeAudio()).rejects.toBe(error)
    expect(last().state).toBe('error')
    await adapter.resumeAudio()
    expect(last().state).toBe('listening')
    expect(call.session.startAudioPlayback).toHaveBeenCalledTimes(2)
    await adapter.stop()
  })
})
