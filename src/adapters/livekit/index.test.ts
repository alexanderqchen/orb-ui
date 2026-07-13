import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveKitAdapter } from './index'
import type { OrbSignal } from '../types'

type Listener = (...args: unknown[]) => void

class FakeTrack {
  mediaStreamTrack = { kind: 'audio' } as MediaStreamTrack
  audioElement = { id: '', remove: vi.fn() } as unknown as HTMLMediaElement
  attach = vi.fn(() => this.audioElement)
  detach = vi.fn(() => [this.audioElement])
}

class FakeParticipant {
  isLocal = false
  attributes: Record<string, string>
  kind?: number
  private track?: FakeTrack

  constructor(options: { attributes?: Record<string, string>; kind?: number; track?: FakeTrack }) {
    this.attributes = options.attributes ?? {}
    this.kind = options.kind
    this.track = options.track
  }

  getTrackPublication(source: string) {
    if (source !== 'microphone' || !this.track) return undefined
    return {
      source,
      track: this.track,
    }
  }
}

class FakeRoom {
  remoteParticipants = new Map<string, FakeParticipant>()
  localMicrophoneTrack?: FakeTrack
  microphoneEnabled = false
  localParticipant = {
    setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
      this.microphoneEnabled = enabled
      if (!enabled || !this.localMicrophoneTrack) return undefined
      return { source: 'microphone', track: this.localMicrophoneTrack }
    }),
    getTrackPublication: vi.fn((source: string) => {
      if (source !== 'microphone' || !this.microphoneEnabled || !this.localMicrophoneTrack) {
        return undefined
      }
      return { source, track: this.localMicrophoneTrack }
    }),
  }
  state = 'disconnected'
  connect = vi.fn(async () => {
    this.state = 'connected'
  })
  disconnect = vi.fn(() => {
    this.state = 'disconnected'
  })

  private listeners = new Map<string, Set<Listener>>()

  constructor(localMicrophoneTrack?: FakeTrack, microphoneEnabled = false) {
    this.localMicrophoneTrack = localMicrophoneTrack
    this.microphoneEnabled = microphoneEnabled
  }

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>()
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

function collectSignals(adapter: { subscribe(listener: (signal: OrbSignal) => void): () => void }) {
  const signals: OrbSignal[] = []
  const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
  return { signals, unsubscribe }
}

function createDocumentStub() {
  const appendChild = vi.fn()
  vi.stubGlobal('document', {
    body: {
      appendChild,
    },
  })
  return { appendChild }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createLiveKitAdapter', () => {
  it('emits local input volume while listening and agent output volume while speaking', () => {
    vi.useFakeTimers()
    createDocumentStub()
    const localTrack = new FakeTrack()
    const agentTrack = new FakeTrack()
    const room = new FakeRoom(localTrack, true)
    room.state = 'connected'
    const agent = new FakeParticipant({
      attributes: { 'lk.agent.state': 'listening' },
      kind: 4,
      track: agentTrack,
    })
    room.remoteParticipants.set('agent', agent)

    const inputAnalyser = {
      calculateVolume: vi.fn(() => 0.25),
      cleanup: vi.fn(async () => undefined),
    }
    const outputAnalyser = {
      calculateVolume: vi.fn(() => 0.5),
      cleanup: vi.fn(async () => undefined),
    }
    const createAudioAnalyser = vi.fn((track: FakeTrack) =>
      track === localTrack ? inputAnalyser : outputAnalyser,
    )

    const adapter = createLiveKitAdapter({ room, createAudioAnalyser })
    const { signals, unsubscribe } = collectSignals(adapter)

    vi.advanceTimersByTime(33)

    expect(signals.at(-1)).toMatchObject({
      state: 'listening',
      inputVolume: expect.any(Number),
      outputVolume: 0,
    })
    expect(signals.at(-1)?.inputVolume).toBeGreaterThan(0)

    agent.attributes['lk.agent.state'] = 'speaking'
    room.emit('participantAttributesChanged', { 'lk.agent.state': 'speaking' }, agent)
    vi.advanceTimersByTime(33)

    expect(signals.at(-1)).toMatchObject({
      state: 'speaking',
      inputVolume: 0,
      outputVolume: expect.any(Number),
    })
    expect(signals.at(-1)?.outputVolume).toBeGreaterThan(0)

    agent.attributes['lk.agent.state'] = 'listening'
    room.emit('participantAttributesChanged', { 'lk.agent.state': 'listening' }, agent)
    vi.advanceTimersByTime(33)

    expect(outputAnalyser.cleanup).toHaveBeenCalledOnce()
    expect(signals.at(-1)?.state).toBe('listening')
    expect(signals.at(-1)?.inputVolume).toBeGreaterThan(0)

    room.emit('localTrackUnpublished', { source: 'microphone', track: localTrack })

    expect(inputAnalyser.cleanup).toHaveBeenCalledOnce()
    expect(signals.at(-1)).toMatchObject({ volume: 0, inputVolume: 0 })

    unsubscribe()
  })

  it('keeps remote speech dynamic instead of flattening analyser output near maximum', () => {
    vi.useFakeTimers()
    createDocumentStub()
    const track = new FakeTrack()
    const room = new FakeRoom()
    room.state = 'connected'
    room.remoteParticipants.set(
      'agent',
      new FakeParticipant({
        attributes: { 'lk.agent.state': 'speaking' },
        kind: 4,
        track,
      }),
    )

    const rawLevels = [0.05, 0.25, 0.1, 0]
    const onOutputVolumeSample = vi.fn()
    const adapter = createLiveKitAdapter({
      room,
      createAudioAnalyser: () => ({
        calculateVolume: () => rawLevels.shift() ?? 0,
        cleanup: async () => undefined,
      }),
      onOutputVolumeSample,
    })
    const { signals, unsubscribe } = collectSignals(adapter)
    const outputLevels: number[] = []

    for (let index = 0; index < 4; index += 1) {
      vi.advanceTimersByTime(33)
      outputLevels.push(signals.at(-1)?.outputVolume ?? 0)
    }

    expect(outputLevels[0]).toBeGreaterThan(0)
    expect(outputLevels[1]).toBeGreaterThan(outputLevels[0])
    expect(outputLevels[1]).toBeLessThan(0.5)
    expect(outputLevels[3]).toBeLessThan(outputLevels[1])
    expect(onOutputVolumeSample).toHaveBeenCalledTimes(4)
    expect(onOutputVolumeSample.mock.calls.map(([sample]) => sample.raw)).toEqual([
      0.05, 0.25, 0.1, 0,
    ])

    unsubscribe()
  })

  it('subscribes to an existing room and emits agent signal and output volume', () => {
    vi.useFakeTimers()
    const { appendChild } = createDocumentStub()
    const track = new FakeTrack()
    const room = new FakeRoom()
    room.state = 'connected'
    room.remoteParticipants.set(
      'agent',
      new FakeParticipant({
        attributes: { 'lk.agent.state': 'speaking' },
        kind: 4,
        track,
      }),
    )
    const analyser = {
      calculateVolume: vi.fn(() => 0.5),
      cleanup: vi.fn(async () => undefined),
    }

    const adapter = createLiveKitAdapter({
      room,
      createAudioAnalyser: () => analyser,
    })
    const { signals, unsubscribe } = collectSignals(adapter)

    vi.advanceTimersByTime(33)

    expect(signals.some((signal) => signal.state === 'speaking')).toBe(true)
    expect(signals.at(-1)).toMatchObject({ state: 'speaking' })
    expect(signals.at(-1)?.outputVolume).toBeGreaterThan(0)
    expect(track.attach).toHaveBeenCalledOnce()
    expect(appendChild).toHaveBeenCalledWith(track.audioElement)

    room.emit(
      'participantAttributesChanged',
      { 'lk.agent.state': 'thinking' },
      new FakeParticipant({ attributes: { 'lk.agent.state': 'thinking' }, kind: 4 }),
    )

    expect(signals.at(-1)).toMatchObject({ state: 'thinking', volume: 0, outputVolume: 0 })
    expect(analyser.cleanup).toHaveBeenCalledOnce()

    unsubscribe()
  })

  it('keeps external rooms non-interactive and detaches agent audio on unsubscribe', () => {
    vi.useFakeTimers()
    createDocumentStub()
    const track = new FakeTrack()
    const room = new FakeRoom()
    room.state = 'connected'
    room.remoteParticipants.set(
      'agent',
      new FakeParticipant({
        attributes: { 'lk.agent.state': 'speaking' },
        kind: 4,
        track,
      }),
    )

    const adapter = createLiveKitAdapter({
      room,
      createAudioAnalyser: () => ({
        calculateVolume: () => 0.4,
        cleanup: async () => undefined,
      }),
    })

    expect(adapter.start).toBeUndefined()
    expect(adapter.stop).toBeUndefined()

    const { unsubscribe } = collectSignals(adapter)
    room.emit('trackUnsubscribed', track)

    expect(track.audioElement.remove).toHaveBeenCalledOnce()

    unsubscribe()
  })

  it('connects and disconnects a managed room without losing the subscriber', async () => {
    const signals: OrbSignal[] = []
    const localTrack = new FakeTrack()
    const localAnalyser = {
      calculateVolume: vi.fn(() => 0.2),
      cleanup: vi.fn(async () => undefined),
    }
    const createAudioAnalyser = vi.fn(() => localAnalyser)

    class RoomClass extends FakeRoom {
      static instance: FakeRoom | undefined

      constructor() {
        super(localTrack)
        RoomClass.instance = this
      }
    }

    const getConnectionDetails = vi.fn(async () => ({
      serverUrl: 'wss://example.livekit.cloud',
      participantToken: 'token',
    }))

    const adapter = createLiveKitAdapter({
      getConnectionDetails,
      createAudioAnalyser,
      RoomClass,
    })

    const unsubscribe = adapter.subscribe((signal) => signals.push(signal))
    await adapter.start?.()

    expect(getConnectionDetails).toHaveBeenCalledWith({})
    expect(RoomClass.instance?.connect).toHaveBeenCalledWith(
      'wss://example.livekit.cloud',
      'token',
      undefined,
    )
    expect(RoomClass.instance?.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    expect(createAudioAnalyser).toHaveBeenCalledWith(localTrack, {
      fftSize: 512,
      smoothingTimeConstant: 0.25,
      minDecibels: -85,
      maxDecibels: -20,
    })
    expect(signals.some((signal) => signal.state === 'connecting')).toBe(true)
    expect(RoomClass.instance?.listenerCount('participantAttributesChanged')).toBe(1)

    await adapter.stop?.()

    expect(RoomClass.instance?.disconnect).toHaveBeenCalledOnce()
    expect(localAnalyser.cleanup).toHaveBeenCalledOnce()
    expect(signals.at(-1)).toMatchObject({
      state: 'idle',
      volume: 0,
      inputVolume: 0,
      outputVolume: 0,
    })

    unsubscribe()
  })

  it('fetches LiveKit token sources with resolved per-start options', async () => {
    let roomIndex = 0

    class RoomClass extends FakeRoom {
      static instance: FakeRoom | undefined

      constructor() {
        super()
        RoomClass.instance = this
      }
    }

    const tokenSource = {
      fetch: vi.fn(async (options: Record<string, unknown>) => ({
        serverUrl: 'wss://example.livekit.cloud',
        participantToken: `token-for-${options.roomName}`,
      })),
    }

    const adapter = createLiveKitAdapter({
      tokenSource,
      tokenOptions: {
        agentName: 'support-agent',
        roomName: () => `orb-ui-test-${++roomIndex}`,
        participantIdentity: () => `tester-${roomIndex}`,
      },
      createAudioAnalyser: () => ({
        calculateVolume: () => 0,
        cleanup: async () => undefined,
      }),
      RoomClass,
    })

    await adapter.start?.()

    expect(tokenSource.fetch).toHaveBeenCalledWith({
      agentName: 'support-agent',
      roomName: 'orb-ui-test-1',
      participantIdentity: 'tester-1',
    })
    expect(RoomClass.instance?.connect).toHaveBeenCalledWith(
      'wss://example.livekit.cloud',
      'token-for-orb-ui-test-1',
      undefined,
    )

    await adapter.stop?.()
  })
})
