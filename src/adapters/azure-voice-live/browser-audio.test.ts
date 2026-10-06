import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPcmBrowserAudio, createPcm16Encoder, decodePcm16 } from './browser-audio'

class FakeNode {
  connect = vi.fn()
  disconnect = vi.fn()
}

function fixture() {
  const stateListeners = new Set<() => void>()
  const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const stream = { getTracks: () => [track] } as unknown as MediaStream
  const capture = Object.assign(new FakeNode(), {
    onprocessorerror: null as (() => void) | null,
    port: { onmessage: null as ((event: { data: Float32Array }) => void) | null, close: vi.fn() },
  })
  const sources: Array<
    FakeNode & {
      buffer: AudioBuffer | null
      onended: (() => void) | null
      stop: ReturnType<typeof vi.fn>
      start: ReturnType<typeof vi.fn>
    }
  > = []
  const context = {
    state: 'running',
    sampleRate: 48_000,
    currentTime: 1,
    destination: new FakeNode(),
    addEventListener: vi.fn((_name: string, listener: () => void) => stateListeners.add(listener)),
    removeEventListener: vi.fn((_name: string, listener: () => void) =>
      stateListeners.delete(listener),
    ),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => {
      context.state = 'closed'
    }),
    createMediaStreamSource: vi.fn(() => new FakeNode()),
    createGain: vi.fn(() => Object.assign(new FakeNode(), { gain: { value: 1 } })),
    createAnalyser: vi.fn(() =>
      Object.assign(new FakeNode(), {
        fftSize: 512,
        getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0.1),
      }),
    ),
    createBuffer: vi.fn((_channels: number, length: number, rate: number) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length),
    })),
    createBufferSource: vi.fn(() => {
      const source = Object.assign(new FakeNode(), {
        buffer: null as AudioBuffer | null,
        onended: null as (() => void) | null,
        stop: vi.fn(),
        start: vi.fn(),
      })
      sources.push(source)
      return source
    }),
  }
  const onInput = vi.fn()
  const onPlayback = vi.fn()
  const onError = vi.fn()
  const onOutputVolume = vi.fn()
  const options = {
    inputSampleRate: 24_000,
    outputSampleRate: 24_000,
    createAudioContext: () => context as unknown as AudioContext,
    createCaptureNode: async () => capture as unknown as AudioWorkletNode,
    getUserMedia: vi.fn(async () => stream),
    onInput,
    onPlayback,
    onError,
    onOutputVolume,
  }
  return { track, stream, capture, context, sources, options, stateListeners }
}

afterEach(() => vi.useRealTimers())

describe('PCM AudioWorklet browser path', () => {
  it('resamples continuously across chunk boundaries into signed little-endian mono PCM', () => {
    const encode = createPcm16Encoder(48_000, 24_000)
    expect(encode(new Float32Array([1]))).toHaveLength(0)
    const bytes = encode(new Float32Array([-1, 0.5, 0.5]))
    expect([...decodePcm16(bytes)]).toEqual([0, 16383 / 32768])
    const encodeFractional = createPcm16Encoder(48_000, 44_100)
    let count = 0
    for (let i = 0; i < 100; i++) count += encodeFractional(new Float32Array(480)).length / 2
    expect(count).toBe(44_100)
  })

  it('captures worklet frames, queues output, flushes interruption and stops all local resources', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const audio = createPcmBrowserAudio(f.options)
    await audio.open()
    f.capture.port.onmessage?.({ data: new Float32Array([0.2, 0.2, 0, 0]) })
    expect(f.options.onInput.mock.calls[0][0]).toHaveLength(4)
    expect(f.options.onInput.mock.calls[0][1]).toBeCloseTo(Math.sqrt(0.02))
    audio.play(new Uint8Array([0, 0, 255, 127]))
    audio.play(new Uint8Array([0, 0]))
    expect(f.sources).toHaveLength(2)
    expect(f.sources[1].start).toHaveBeenCalledWith(1 + 2 / 24_000)
    expect(audio.hasOutput).toBe(true)
    vi.advanceTimersByTime(33)
    expect(f.options.onOutputVolume).toHaveBeenCalledWith(expect.closeTo(0.1))
    const lateEnd = f.sources[0].onended
    audio.clear()
    expect(audio.hasOutput).toBe(false)
    expect(f.sources[0].stop).toHaveBeenCalledOnce()
    const count = f.options.onPlayback.mock.calls.length
    lateEnd?.()
    expect(f.options.onPlayback).toHaveBeenCalledTimes(count)
    await audio.close()
    await audio.close()
    expect(f.track.stop).toHaveBeenCalledOnce()
    expect(f.capture.port.close).toHaveBeenCalledOnce()
    expect(f.context.close).toHaveBeenCalledOnce()
    expect(f.capture.port.onmessage).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases microphone permission arriving after unmount and never builds capture nodes', async () => {
    const f = fixture()
    let acquired: (stream: MediaStream) => void = () => undefined
    f.options.getUserMedia.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acquired = resolve
        }),
    )
    const audio = createPcmBrowserAudio(f.options)
    const opening = audio.open()
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(f.options.getUserMedia).toHaveBeenCalled())
    await audio.close()
    acquired(f.stream)
    await rejected
    expect(f.track.stop).toHaveBeenCalledOnce()
    expect(f.context.createMediaStreamSource).not.toHaveBeenCalled()
  })

  it('reports invalid worklet frames and rejects malformed PCM', async () => {
    const f = fixture()
    const audio = createPcmBrowserAudio(f.options)
    await audio.open()
    expect(() => audio.play(new Uint8Array([0]))).toThrow('whole samples')
    f.capture.port.onmessage?.({ data: [] as unknown as Float32Array })
    expect(f.options.onError).toHaveBeenCalledOnce()
    f.capture.onprocessorerror?.()
    expect(f.options.onError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'The microphone AudioWorklet failed.' }),
    )
    await audio.close()
  })

  it('flushes and reports suspended audio instead of claiming queued sources are audible', async () => {
    const f = fixture()
    const audio = createPcmBrowserAudio(f.options)
    await audio.open()
    audio.play(new Uint8Array([0, 0, 255, 127]))
    expect(audio.hasOutput).toBe(true)
    f.context.state = 'suspended'
    f.stateListeners.forEach((listener) => listener())
    expect(audio.hasOutput).toBe(false)
    expect(f.sources[0].stop).toHaveBeenCalledOnce()
    expect(f.options.onPlayback).toHaveBeenLastCalledWith(false)
    expect(f.options.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Browser audio is suspended. Start a new session to resume.',
      }),
    )
    expect(() => audio.play(new Uint8Array([0, 0]))).toThrow('Browser audio is suspended')
    expect(f.sources).toHaveLength(1)
    await audio.close()
    expect(f.stateListeners.size).toBe(0)
  })

  it('rejects audio suspended during microphone permission and releases the acquired track', async () => {
    const f = fixture()
    f.options.getUserMedia.mockImplementationOnce(async () => {
      f.context.state = 'suspended'
      return f.stream
    })
    const audio = createPcmBrowserAudio(f.options)
    await expect(audio.open()).rejects.toThrow('Browser audio is suspended')
    await audio.close()
    expect(f.track.stop).toHaveBeenCalledOnce()
    expect(f.context.createMediaStreamSource).not.toHaveBeenCalled()
  })
})
