import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAzureVoiceLiveAdapter } from './index'
import type { AzureVoiceLiveHandlers, AzureVoiceLiveSession } from './index'
import type { OrbSignal } from '../types'

const audio = vi.hoisted(() => ({
  open: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  clear: vi.fn(),
  playing: false,
  options: undefined as unknown as {
    onInput(bytes: Uint8Array, rms: number): void
    onPlayback(playing: boolean): void
    onError(error: unknown): void
  },
  play: vi.fn(),
}))

vi.mock('./browser-audio', () => ({
  createPcmBrowserAudio: (options: typeof audio.options) => {
    audio.options = options
    return {
      open: audio.open,
      close: audio.close,
      clear: audio.clear,
      play: audio.play,
      get hasOutput() {
        return audio.playing
      },
    }
  },
}))

function fixture() {
  let handlers: AzureVoiceLiveHandlers = {}
  const sdk: AzureVoiceLiveSession = {
    subscribe: vi.fn((next) => {
      handlers = next
      return { close: vi.fn(async () => undefined) }
    }),
    connect: vi.fn(async () => undefined),
    updateSession: vi.fn(async () => undefined),
    sendAudio: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  }
  const createSession = vi.fn(async () => sdk)
  const adapter = createAzureVoiceLiveAdapter({ createSession })
  const signals: OrbSignal[] = []
  adapter.subscribe((signal) => signals.push(signal))
  return {
    adapter,
    signals,
    sdk,
    createSession,
    get handlers() {
      return handlers
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  audio.open.mockImplementation(async () => undefined)
  audio.playing = false
  audio.play.mockImplementation(() => {
    audio.playing = true
    audio.options.onPlayback(true)
  })
  audio.clear.mockImplementation(() => {
    audio.playing = false
    audio.options.onPlayback(false)
  })
})

afterEach(() => vi.useRealTimers())

describe('Azure Voice Live SDK bridge', () => {
  it('connects once, configures PCM and waits for playback drain after response.done', async () => {
    const f = fixture()
    const starting = f.adapter.start()
    expect(f.adapter.start()).toBe(starting)
    await starting
    expect(f.createSession).toHaveBeenCalledOnce()
    expect(f.sdk.updateSession).toHaveBeenLastCalledWith({
      inputAudioFormat: 'pcm16',
      inputAudioSamplingRate: 24_000,
      outputAudioFormat: 'pcm16',
    })
    audio.options.onInput(new Uint8Array([0, 1]), 0.2)
    expect(f.sdk.sendAudio).toHaveBeenCalledWith(new Uint8Array([0, 1]))
    await f.handlers.onServerEvent?.({ type: 'input_audio_buffer.speech_stopped' })
    expect(f.signals.at(-1)?.state).toBe('thinking')
    await f.handlers.onServerEvent?.({ type: 'response.created', response: { id: 'r1' } })
    await f.handlers.onServerEvent?.({
      type: 'response.audio.delta',
      responseId: 'r1',
      delta: new Uint8Array([0, 0]),
    })
    expect(f.signals.at(-1)?.state).toBe('speaking')
    await f.handlers.onServerEvent?.({
      type: 'response.done',
      response: { id: 'r1', status: 'completed' },
    })
    expect(f.signals.at(-1)?.state).toBe('speaking')
    audio.playing = false
    audio.options.onPlayback(false)
    expect(f.signals.at(-1)?.state).toBe('listening')
    await f.adapter.stop()
    expect(audio.close).toHaveBeenCalledOnce()
    expect(f.sdk.dispose).toHaveBeenCalledOnce()
    expect(f.signals.at(-1)).toMatchObject({ state: 'idle', inputVolume: 0, outputVolume: 0 })
  })

  it('clears interrupted audio and ignores late chunks and callbacks after reconnect', async () => {
    const f = fixture()
    await f.adapter.start()
    const stale = f.handlers
    await stale.onServerEvent?.({ type: 'response.created', response: { id: 'old-response' } })
    await stale.onServerEvent?.({ type: 'input_audio_buffer.speech_started' })
    await stale.onServerEvent?.({ type: 'input_audio_buffer.speech_stopped' })
    await stale.onServerEvent?.({
      type: 'response.audio.delta',
      responseId: 'old-response',
      delta: new Uint8Array([0, 0]),
    })
    expect(audio.play).not.toHaveBeenCalled()
    expect(audio.clear).toHaveBeenCalledOnce()
    await f.adapter.stop()
    await f.adapter.start()
    await stale.onError?.({ error: new Error('old socket failure') })
    expect(f.signals.at(-1)?.state).toBe('listening')
    expect(f.createSession).toHaveBeenCalledTimes(2)
    await f.adapter.stop()
  })

  it('blocks provider startup on permission failure', async () => {
    audio.open.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
    const f = fixture()
    await expect(f.adapter.start()).rejects.toThrow('Permission denied')
    expect(f.createSession).not.toHaveBeenCalled()
    expect(audio.close).toHaveBeenCalledOnce()
    expect(f.signals.at(-1)?.state).toBe('error')
  })

  it('cancels startup and disposes a late SDK session', async () => {
    let resolve: (session: AzureVoiceLiveSession) => void = () => undefined
    const f = fixture()
    f.createSession.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const start = f.adapter.start()
    const rejected = expect(start).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(f.createSession).toHaveBeenCalled())
    await f.adapter.stop()
    await rejected
    resolve(f.sdk)
    await vi.waitFor(() => expect(f.sdk.dispose).toHaveBeenCalledOnce())
    expect(f.sdk.connect).not.toHaveBeenCalled()
    expect(f.signals.at(-1)?.state).toBe('idle')
  })

  it('fails startup on deadline and closes audio for a transport error', async () => {
    vi.useFakeTimers()
    audio.open.mockImplementationOnce(() => new Promise(() => undefined))
    const f = fixture()
    const start = f.adapter.start()
    const rejection = expect(start).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(30_000)
    await rejection
    expect(f.signals.at(-1)?.state).toBe('error')
    expect(audio.close).toHaveBeenCalledOnce()
    await f.adapter.start()
    await f.handlers.onError?.({ error: new Error('transport failed') })
    expect(f.signals.at(-1)?.state).toBe('error')
    expect(f.sdk.dispose).toHaveBeenCalledOnce()
  })
})
