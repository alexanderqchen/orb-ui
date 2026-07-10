import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGeminiLiveAdapter } from './index'
import type { GeminiLiveCallbacks, GeminiLiveSession } from './index'
import type { OrbSignal } from '../types'

class FakeAudioNode {
  connect = vi.fn(() => this)
  disconnect = vi.fn()
}

class FakeScriptProcessor extends FakeAudioNode {
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null = null

  process(samples: Float32Array) {
    this.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => samples,
      },
    } as unknown as AudioProcessingEvent)
  }
}

class FakeBufferSource extends FakeAudioNode {
  buffer: AudioBuffer | null = null
  onended: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()

  finish() {
    this.onended?.()
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running'
  sampleRate = 48_000
  currentTime = 1
  outputSample = 0
  destination = new FakeAudioNode() as unknown as AudioDestinationNode
  processor = new FakeScriptProcessor()
  sources: FakeBufferSource[] = []
  close = vi.fn(async () => {
    this.state = 'closed'
  })
  resume = vi.fn(async () => undefined)
  createMediaStreamSource = vi.fn(
    () => new FakeAudioNode() as unknown as MediaStreamAudioSourceNode,
  )
  createScriptProcessor = vi.fn(() => this.processor as unknown as ScriptProcessorNode)
  createGain = vi.fn(() => {
    const node = new FakeAudioNode() as FakeAudioNode & { gain: { value: number } }
    node.gain = { value: 1 }
    return node as unknown as GainNode
  })
  createAnalyser = vi.fn(() => {
    const node = new FakeAudioNode() as FakeAudioNode & {
      fftSize: number
      smoothingTimeConstant: number
      getFloatTimeDomainData: (samples: Float32Array) => void
    }
    node.fftSize = 512
    node.smoothingTimeConstant = 0
    node.getFloatTimeDomainData = (samples) => samples.fill(this.outputSample)
    return node as unknown as AnalyserNode
  })
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => {
    const data = new Float32Array(length)
    return {
      duration: length / sampleRate,
      getChannelData: () => data,
    } as unknown as AudioBuffer
  })
  createBufferSource = vi.fn(() => {
    const source = new FakeBufferSource()
    this.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createGeminiLiveAdapter', () => {
  it('streams microphone PCM and maps Live session audio to speaking signals', async () => {
    vi.useFakeTimers()
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack
    const stream = { getTracks: () => [track] } as unknown as MediaStream
    const context = new FakeAudioContext()
    context.outputSample = 0.01
    let callbacks: GeminiLiveCallbacks | undefined
    const outputSamples: Array<{ raw: number; shaped: number; normalized: number }> = []
    const sent: Array<Parameters<GeminiLiveSession['sendRealtimeInput']>[0]> = []
    const session: GeminiLiveSession = {
      sendRealtimeInput: vi.fn((input) => sent.push(input)),
      close: vi.fn(),
    }
    const adapter = createGeminiLiveAdapter({
      connect: async (nextCallbacks) => {
        callbacks = nextCallbacks
        return session
      },
      getUserMedia: async () => stream,
      createAudioContext: () => context as unknown as AudioContext,
      onOutputVolumeSample: (sample) => outputSamples.push(sample),
    })
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))

    await adapter.start()
    expect(signals.at(-1)).toMatchObject({ state: 'listening' })

    context.processor.process(new Float32Array(4096).fill(0.2))
    expect(sent.at(-1)?.audio).toMatchObject({ mimeType: 'audio/pcm;rate=16000' })
    expect(sent.at(-1)?.audio?.data).toBeTruthy()
    expect(signals.at(-1)?.inputVolume).toBeGreaterThan(0)

    context.processor.process(new Float32Array(4096))
    vi.advanceTimersByTime(500)
    expect(signals.at(-1)).toMatchObject({ state: 'thinking' })

    const outputPcm = btoa(String.fromCharCode(0, 0, 255, 127, 0, 0))
    callbacks?.onmessage({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: outputPcm, mimeType: 'audio/pcm;rate=24000' } }],
        },
        turnComplete: true,
      },
    })
    expect(signals.at(-1)).toMatchObject({ state: 'speaking' })
    expect(context.sources).toHaveLength(1)
    vi.advanceTimersByTime(33)
    const expectedShaped = Math.pow((0.01 - 0.003) * 4, 0.8)
    expect(outputSamples.at(-1)?.raw).toBeCloseTo(0.01)
    expect(outputSamples.at(-1)?.shaped).toBeCloseTo(expectedShaped)
    expect(outputSamples.at(-1)?.normalized).toBeCloseTo(expectedShaped * 0.3)

    const speakingSignalCount = signals.length
    callbacks?.onmessage({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: outputPcm, mimeType: 'audio/pcm;rate=24000' } }],
        },
      },
    })
    expect(signals).toHaveLength(speakingSignalCount)
    expect(context.sources).toHaveLength(2)

    context.sources[0].finish()
    expect(signals.at(-1)).toMatchObject({ state: 'speaking' })
    context.sources[1].finish()
    expect(signals.at(-1)).toMatchObject({ state: 'listening' })

    await adapter.stop()
    expect(sent.at(-1)).toEqual({ audioStreamEnd: true })
    expect(session.close).toHaveBeenCalledOnce()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(signals.at(-1)).toMatchObject({ state: 'idle' })
  })

  it('clears queued audio on interruption and surfaces connection errors', async () => {
    vi.useFakeTimers()
    const context = new FakeAudioContext()
    let callbacks: GeminiLiveCallbacks | undefined
    const session: GeminiLiveSession = {
      sendRealtimeInput: vi.fn(),
      close: vi.fn(),
    }
    const adapter = createGeminiLiveAdapter({
      connect: async (nextCallbacks) => {
        callbacks = nextCallbacks
        return session
      },
      getUserMedia: async () => ({ getTracks: () => [] }) as unknown as MediaStream,
      createAudioContext: () => context as unknown as AudioContext,
    })
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))
    await adapter.start()

    callbacks?.onmessage({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: btoa(String.fromCharCode(0, 0)) } }],
        },
      },
    })
    callbacks?.onmessage({ serverContent: { interrupted: true } })
    expect(context.sources[0].stop).toHaveBeenCalled()
    expect(signals.at(-1)).toMatchObject({ state: 'listening' })

    const error = new Error('socket failed')
    callbacks?.onerror?.(error)
    expect(signals.at(-1)).toMatchObject({ state: 'error', error })
  })

  it('sends explicit activity markers by default for deterministic turn detection', async () => {
    vi.useFakeTimers()
    const context = new FakeAudioContext()
    const sent: Array<Parameters<GeminiLiveSession['sendRealtimeInput']>[0]> = []
    const session: GeminiLiveSession = {
      sendRealtimeInput: vi.fn((input) => sent.push(input)),
      close: vi.fn(),
    }
    const adapter = createGeminiLiveAdapter({
      connect: async () => session,
      getUserMedia: async () => ({ getTracks: () => [] }) as unknown as MediaStream,
      createAudioContext: () => context as unknown as AudioContext,
    })

    await adapter.start()
    context.processor.process(new Float32Array(4096).fill(0.2))
    expect(sent.at(-2)).toEqual({ activityStart: {} })
    expect(sent.at(-1)?.audio).toBeDefined()

    context.processor.process(new Float32Array(4096))
    vi.advanceTimersByTime(500)
    expect(sent.at(-1)).toEqual({ activityEnd: {} })

    await adapter.stop()
    expect(sent.at(-1)).toEqual({ audioStreamEnd: true })
  })

  it('can defer activity detection to the Gemini server', async () => {
    vi.useFakeTimers()
    const context = new FakeAudioContext()
    const sent: Array<Parameters<GeminiLiveSession['sendRealtimeInput']>[0]> = []
    const session: GeminiLiveSession = {
      sendRealtimeInput: vi.fn((input) => sent.push(input)),
      close: vi.fn(),
    }
    const adapter = createGeminiLiveAdapter({
      activityDetection: 'server',
      connect: async () => session,
      getUserMedia: async () => ({ getTracks: () => [] }) as unknown as MediaStream,
      createAudioContext: () => context as unknown as AudioContext,
    })

    await adapter.start()
    context.processor.process(new Float32Array(4096).fill(0.2))
    context.processor.process(new Float32Array(4096))
    vi.advanceTimersByTime(500)

    expect(sent.some((input) => input.activityStart || input.activityEnd)).toBe(false)
    await adapter.stop()
    expect(sent.at(-1)).toEqual({ audioStreamEnd: true })
  })
})
