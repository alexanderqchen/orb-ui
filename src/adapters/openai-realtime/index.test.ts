import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenAIRealtimeAdapter } from './index'
import type { OrbSignal } from '../types'

class FakeDataChannel {
  readyState = 'connecting'
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: (() => void) | null = null
  close = vi.fn(() => {
    this.readyState = 'closed'
  })

  open() {
    this.readyState = 'open'
    this.onopen?.()
  }

  message(type: string, extra: Record<string, unknown> = {}) {
    this.onmessage?.({ data: JSON.stringify({ type, ...extra }) } as MessageEvent)
  }
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = 'new'
  localDescription: RTCSessionDescription | null = null
  remoteDescription: RTCSessionDescription | null = null
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  dataChannel = new FakeDataChannel()
  addTrack = vi.fn()
  createDataChannel = vi.fn(() => this.dataChannel as unknown as RTCDataChannel)
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'offer-sdp' }))
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description as RTCSessionDescription
  })
  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = description as RTCSessionDescription
  })
  close = vi.fn(() => {
    this.connectionState = 'closed'
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createOpenAIRealtimeAdapter', () => {
  it('negotiates GA WebRTC and maps Realtime events to orb signals', async () => {
    const track = { stop: vi.fn(), kind: 'audio' } as unknown as MediaStreamTrack
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream
    const peerConnection = new FakePeerConnection()
    const fetchMock = vi.fn(async () => new Response('answer-sdp', { status: 200 }))
    const audioElement = {
      autoplay: false,
      srcObject: null,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAudioElement
    const adapter = createOpenAIRealtimeAdapter({
      getClientSecret: async () => ({ value: 'ephemeral-secret' }),
      getUserMedia: async () => stream,
      createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      createAudioElement: () => audioElement,
      createAudioContext: () => undefined,
      fetch: fetchMock as typeof fetch,
    })
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))

    await adapter.start()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/calls',
      expect.objectContaining({
        method: 'POST',
        body: 'offer-sdp',
        headers: {
          Authorization: 'Bearer ephemeral-secret',
          'Content-Type': 'application/sdp',
        },
      }),
    )
    expect(peerConnection.remoteDescription).toMatchObject({
      type: 'answer',
      sdp: 'answer-sdp',
    })

    peerConnection.dataChannel.open()
    expect(signals.at(-1)).toMatchObject({ state: 'listening' })

    peerConnection.dataChannel.message('input_audio_buffer.speech_stopped')
    expect(signals.at(-1)).toMatchObject({ state: 'thinking' })

    peerConnection.dataChannel.message('output_audio_buffer.started')
    expect(signals.at(-1)).toMatchObject({ state: 'speaking' })

    const speakingSignalCount = signals.length
    peerConnection.dataChannel.message('response.output_audio.delta')
    peerConnection.dataChannel.message('response.output_audio.delta')
    expect(signals).toHaveLength(speakingSignalCount)

    peerConnection.dataChannel.message('output_audio_buffer.stopped')
    expect(signals.at(-1)).toMatchObject({ state: 'listening' })

    const providerError = { message: 'rate limit' }
    peerConnection.dataChannel.message('error', { error: providerError })
    expect(signals.at(-1)).toMatchObject({ state: 'error', error: providerError })

    await adapter.stop()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(peerConnection.close).toHaveBeenCalledOnce()
    expect(signals.at(-1)).toMatchObject({ state: 'idle' })
  })

  it('surfaces SDP negotiation failures and cleans up microphone tracks', async () => {
    const track = { stop: vi.fn(), kind: 'audio' } as unknown as MediaStreamTrack
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream
    const peerConnection = new FakePeerConnection()
    const adapter = createOpenAIRealtimeAdapter({
      getClientSecret: async () => 'ephemeral-secret',
      getUserMedia: async () => stream,
      createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      createAudioElement: () =>
        ({
          pause: vi.fn(),
          remove: vi.fn(),
        }) as unknown as HTMLAudioElement,
      createAudioContext: () => undefined,
      fetch: vi.fn(async () => new Response('invalid token', { status: 401 })) as typeof fetch,
    })
    const signals: OrbSignal[] = []
    adapter.subscribe((signal) => signals.push(signal))

    await expect(adapter.start()).rejects.toThrow('Session negotiation failed (401)')
    expect(track.stop).toHaveBeenCalledOnce()
    expect(peerConnection.close).toHaveBeenCalledOnce()
    expect(signals.at(-1)?.state).toBe('error')
  })
})
