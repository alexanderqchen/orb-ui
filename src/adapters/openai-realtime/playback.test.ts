import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenAIRealtimeAdapter } from './index'
import type { OrbSignal } from '../types'

afterEach(() => vi.useRealTimers())

async function meteredSession() {
  const track = { stop: vi.fn(), kind: 'audio' } as unknown as MediaStreamTrack
  const input = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream
  const output = {} as MediaStream
  let outputLevel = 0
  const channel = {
    onopen: null as (() => void) | null,
    onmessage: null as ((event: MessageEvent) => void) | null,
    close: vi.fn(),
  }
  const peer = {
    ontrack: null as ((event: RTCTrackEvent) => void) | null,
    addTrack: vi.fn(),
    createDataChannel: () => channel,
    createOffer: async () => ({ type: 'offer', sdp: 'offer-sdp' }),
    setLocalDescription: vi.fn(),
    setRemoteDescription: vi.fn(),
    close: vi.fn(),
  }
  const adapter = createOpenAIRealtimeAdapter({
    getClientSecret: async () => 'ephemeral-secret',
    getUserMedia: async () => input,
    createPeerConnection: () => peer as unknown as RTCPeerConnection,
    createAudioElement: () =>
      ({
        play: vi.fn(async () => undefined),
        pause: vi.fn(),
        remove: vi.fn(),
      }) as unknown as HTMLAudioElement,
    createAudioContext: () => {
      let source: MediaStream
      return {
        state: 'running',
        close: vi.fn(async () => undefined),
        createMediaStreamSource: (stream: MediaStream) => {
          source = stream
          return { connect: vi.fn(), disconnect: vi.fn() }
        },
        createAnalyser: () => ({
          fftSize: 512,
          smoothingTimeConstant: 0,
          getFloatTimeDomainData: (samples: Float32Array) =>
            samples.fill(source === output ? outputLevel : 0.05),
          disconnect: vi.fn(),
        }),
      } as unknown as AudioContext
    },
    fetch: vi.fn(async () => new Response('answer-sdp')) as typeof fetch,
  })
  const signals: OrbSignal[] = []
  adapter.subscribe((signal) => signals.push(signal))
  const attach = () => {
    channel.onopen?.()
    peer.ontrack?.({ streams: [output], track } as unknown as RTCTrackEvent)
  }
  await adapter.start()
  attach()
  return {
    adapter,
    signals,
    attach,
    event: (type: string) =>
      channel.onmessage?.({ data: JSON.stringify({ type }) } as MessageEvent),
    setOutput: (value: number) => {
      outputLevel = value
    },
  }
}

describe('OpenAI playback priority', () => {
  it('keeps server playback boundaries stable through delayed packets, envelope tails, and interruption', async () => {
    vi.useFakeTimers()
    const { adapter, signals, event, setOutput } = await meteredSession()
    event('output_audio_buffer.started')
    const started = signals.length
    // First packets can arrive after buffer-start. Silence must not flash listening.
    vi.advanceTimersByTime(400)
    expect(signals.slice(started).every((signal) => signal.state === 'speaking')).toBe(true)
    setOutput(0.1)
    vi.advanceTimersByTime(300)
    expect(signals.at(-1)?.outputVolume).toBeGreaterThan(0.3)
    event('output_audio_buffer.stopped')
    setOutput(0)
    const stopped = signals.length
    vi.advanceTimersByTime(33)
    expect(signals.at(-1)?.outputVolume).toBeGreaterThan(0.2)
    vi.advanceTimersByTime(1000)
    expect(signals.slice(stopped).every((signal) => signal.state === 'listening')).toBe(true)

    event('output_audio_buffer.started')
    setOutput(0.1)
    vi.advanceTimersByTime(200)
    event('input_audio_buffer.speech_started')
    const interrupted = signals.length
    event('response.created')
    event('response.output_audio.delta')
    vi.advanceTimersByTime(200)
    expect(signals.slice(interrupted).every((signal) => signal.state === 'listening')).toBe(true)
    event('output_audio_buffer.cleared')
    event('input_audio_buffer.speech_stopped')
    expect(signals.at(-1)?.state).toBe('thinking')
    event('output_audio_buffer.started')
    expect(signals.at(-1)?.state).toBe('speaking')
    await adapter.stop()
  })

  it('retains meter fallback when playback events are unavailable, including after restart', async () => {
    vi.useFakeTimers()
    const { adapter, signals, event, setOutput, attach } = await meteredSession()
    setOutput(0.1)
    vi.advanceTimersByTime(200)
    expect(signals.at(-1)?.state).toBe('speaking')
    setOutput(0)
    vi.advanceTimersByTime(1500)
    expect(signals.at(-1)?.state).toBe('listening')
    event('output_audio_buffer.stopped')
    await adapter.stop()
    await adapter.start()
    attach()
    setOutput(0.1)
    vi.advanceTimersByTime(200)
    expect(signals.at(-1)?.state).toBe('speaking')
    event('error')
    vi.advanceTimersByTime(200)
    expect(signals.at(-1)?.state).toBe('error')
    await adapter.stop()
  })
})
