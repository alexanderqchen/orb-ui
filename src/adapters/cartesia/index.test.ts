import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCartesiaAdapter } from './index'
import type { OrbSignal } from '../types'

const audio = vi.hoisted(() => ({
  open: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  clear: vi.fn(),
  playing: false,
  options: undefined as unknown as {
    onInput(bytes: Uint8Array, rms: number): void
    onPlayback(playing: boolean): void
  },
  play: vi.fn(),
}))

vi.mock('../azure-voice-live/browser-audio', async (original) => ({
  ...(await original<typeof import('../azure-voice-live/browser-audio')>()),
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

class Socket {
  readyState = 0
  bufferedAmount = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = 3
  })
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  receive(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) })
  }
  ready() {
    this.receive({
      type: 'session_ready',
      call_id: 'ac-fixture',
      audio: { input_format: 'pcm_24000', output_delivery: 'speaking_pace' },
    })
  }
}

function fixture() {
  const sockets: Socket[] = []
  const getAccessToken = vi.fn(async () => 'visitor-token')
  const onRecoverableError = vi.fn()
  const createWebSocket = vi.fn(() => {
    const socket = new Socket()
    sockets.push(socket)
    return socket as unknown as WebSocket
  })
  const adapter = createCartesiaAdapter({
    agentId: 'agent-fixture',
    getAccessToken,
    createWebSocket,
    onRecoverableError,
  })
  const signals: OrbSignal[] = []
  adapter.subscribe((signal) => signals.push(signal))
  async function start() {
    const previousCount = sockets.length
    const promise = adapter.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(previousCount + 1))
    sockets.at(-1)?.open()
    sockets.at(-1)?.ready()
    await promise
    return sockets.at(-1)!
  }
  return { adapter, signals, sockets, getAccessToken, createWebSocket, onRecoverableError, start }
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

describe('Cartesia Managed Agent browser WebSocket', () => {
  it('sends session_create first, waits for session_ready and streams base64 PCM JSON', async () => {
    const f = fixture()
    const starting = f.adapter.start()
    expect(f.adapter.start()).toBe(starting)
    await vi.waitFor(() => expect(f.sockets).toHaveLength(1))
    const socket = f.sockets[0]
    audio.options.onInput(new Uint8Array([0, 0]), 0.1)
    expect(socket.send).not.toHaveBeenCalled()
    socket.open()
    expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({
      type: 'session_create',
      audio: { input_format: 'pcm_24000', output_delivery: 'speaking_pace' },
    })
    expect(f.signals.at(-1)?.state).toBe('connecting')
    socket.ready()
    await starting
    expect(f.adapter.callId).toBe('ac-fixture')
    expect(f.createWebSocket).toHaveBeenCalledWith(
      expect.stringContaining('cartesia_version=2026-08-14'),
    )
    expect(f.createWebSocket).toHaveBeenCalledWith(
      expect.stringContaining('access_token=visitor-token'),
    )
    audio.options.onInput(new Uint8Array([0, 0, 255, 127]), 0.2)
    expect(JSON.parse(socket.send.mock.calls.at(-1)![0])).toEqual({
      type: 'audio_input',
      audio: 'AAD/fw==',
    })
    await f.adapter.stop()
    expect(socket.close).toHaveBeenCalledWith(1000, 'session completed')
    expect(socket.onmessage).toBeNull()
    expect(audio.close).toHaveBeenCalledOnce()
  })

  it('maps turns, waits for output drain and flushes interrupted playback', async () => {
    const f = fixture()
    const socket = await f.start()
    socket.receive({ type: 'turn_started', turn: 1, role: 'user' })
    socket.receive({ type: 'turn_ended', turn: 1, role: 'user', text: 'Hello' })
    expect(f.signals.at(-1)?.state).toBe('thinking')
    socket.receive({ type: 'turn_started', turn: 2, role: 'assistant' })
    socket.receive({ type: 'audio_output', audio: 'AAD/fw==' })
    expect(audio.play).toHaveBeenCalledWith(new Uint8Array([0, 0, 255, 127]))
    expect(f.signals.at(-1)?.state).toBe('speaking')
    socket.receive({ type: 'turn_ended', turn: 2, role: 'assistant', text: 'Hi' })
    expect(f.signals.at(-1)?.state).toBe('speaking')
    audio.playing = false
    audio.options.onPlayback(false)
    expect(f.signals.at(-1)?.state).toBe('listening')
    socket.receive({ type: 'audio_output', audio: 'AAD/fw==' })
    socket.receive({ type: 'audio_output_clear' })
    expect(f.signals.at(-1)).toMatchObject({ state: 'listening', outputVolume: 0 })
    const played = audio.play.mock.calls.length
    socket.receive({ type: 'audio_output', audio: 'AAD/fw==' })
    expect(audio.play).toHaveBeenCalledTimes(played)
    await f.adapter.stop()
  })

  it('preserves recoverable errors and enforces tool response limits', async () => {
    const f = fixture()
    const socket = await f.start()
    socket.receive({ type: 'error', fatal: false, message: 'Invalid DTMF' })
    expect(f.onRecoverableError).toHaveBeenCalledOnce()
    expect(f.signals.at(-1)?.state).toBe('listening')
    f.adapter.sendToolResult('tool-1', '2 items')
    expect(JSON.parse(socket.send.mock.calls.at(-1)![0])).toEqual({
      type: 'client_tool_result',
      tool_call_id: 'tool-1',
      result: '2 items',
      is_error: false,
    })
    expect(() => f.adapter.sendToolResult('tool-1', 'é'.repeat(2049))).toThrow('4096')
    socket.receive({ type: 'error', fatal: true, message: 'Agent unavailable' })
    expect(f.signals.at(-1)?.state).toBe('error')
    expect(socket.close).toHaveBeenCalledOnce()
    expect(audio.close).toHaveBeenCalledOnce()
  })

  it('stops before credentials resolve and reconnects with a new token and no stale socket events', async () => {
    const f = fixture()
    let resolveToken: (token: string) => void = () => undefined
    f.getAccessToken.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveToken = resolve
        }),
    )
    const starting = f.adapter.start()
    const rejected = expect(starting).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(f.getAccessToken).toHaveBeenCalledOnce())
    await f.adapter.stop()
    await rejected
    resolveToken('late-token')
    await Promise.resolve()
    expect(f.createWebSocket).not.toHaveBeenCalled()
    const socket = await f.start()
    const stale = socket.onmessage
    await f.adapter.stop()
    const start = f.adapter.start()
    await vi.waitFor(() => expect(f.sockets).toHaveLength(2))
    f.sockets[1].open()
    f.sockets[1].ready()
    await start
    stale?.({ data: JSON.stringify({ type: 'error', fatal: true }) })
    expect(f.signals.at(-1)?.state).toBe('listening')
    expect(f.getAccessToken).toHaveBeenCalledTimes(3)
    await f.adapter.stop()
  })

  it('does not open a billable socket after microphone denial', async () => {
    const f = fixture()
    audio.open.mockRejectedValueOnce(new Error('Microphone denied'))
    await expect(f.adapter.start()).rejects.toThrow('Microphone denied')
    expect(f.getAccessToken).not.toHaveBeenCalled()
    expect(f.createWebSocket).not.toHaveBeenCalled()
    expect(audio.close).toHaveBeenCalledOnce()
  })

  it('fails on missing readiness, malformed output and transport backpressure', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const starting = f.adapter.start()
    const rejected = expect(starting).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(30_000)
    await rejected
    expect(f.signals.at(-1)?.state).toBe('error')
    vi.useRealTimers()
    const socket = await f.start()
    socket.bufferedAmount = 128 * 1024 + 1
    audio.options.onInput(new Uint8Array([0, 0]), 0)
    expect(f.signals.at(-1)?.state).toBe('error')
    const fresh = await f.start()
    fresh.receive({ type: 'audio_output', audio: '%%invalid' })
    expect(f.signals.at(-1)?.state).toBe('error')
  })
})
