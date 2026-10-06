import { io, type Socket } from 'socket.io-client'
import { createNovaSonicBridge, type NovaSonicTranscript } from 'orb-ui/adapters'
import { PcmPlayer } from './audio'
import type { ClientEvents, Mode, ServerEvents } from './protocol'

interface Run {
  id: string
  abort: AbortController
  context: AudioContext
  player: PcmPlayer
  socket: Socket<ServerEvents, ClientEvents> | null
  stream: MediaStream | null
  source: MediaStreamAudioSourceNode | null
  worklet: AudioWorkletNode | null
  silence: GainNode | null
  frames: Uint8Array[]
  sending: boolean
  ready: boolean
  disposed: boolean
}

export class BrowserSession {
  private run: Run | null = null
  readonly bridge = createNovaSonicBridge({
    onInterrupt: () => this.run?.player.interrupt(),
    onTranscript: (transcript) => this.onTranscript(transcript),
  })

  constructor(
    private readonly onTranscript: (transcript: NovaSonicTranscript) => void,
    private readonly onMode: (mode: Mode) => void,
  ) {}

  async start() {
    if (this.run) return
    const id = crypto.randomUUID()
    this.bridge.beginSession(id)
    let context: AudioContext
    let player: PcmPlayer
    try {
      context = new AudioContext() // Created by the click, before network/permission awaits.
      player = new PcmPlayer(context, (active, volume) =>
        this.bridge.setPlayback(id, active, volume),
      )
    } catch (error) {
      this.bridge.failed(id, error)
      return
    }
    const run: Run = {
      id,
      context,
      abort: new AbortController(),
      player,
      socket: null,
      stream: null,
      source: null,
      worklet: null,
      silence: null,
      frames: [],
      sending: false,
      ready: false,
      disposed: false,
    }
    this.run = run
    const current = () => {
      if (this.run !== run) throw new DOMException('Session stopped', 'AbortError')
    }
    try {
      await context.resume()
      current()
      const response = await fetch('/api/nova-session', {
        method: 'POST',
        signal: run.abort.signal,
      })
      const data: unknown = await response.json()
      if (!response.ok)
        throw new Error('Local backend unavailable or busy. Start the Node server and try again.')
      if (
        typeof data !== 'object' ||
        data === null ||
        !('token' in data) ||
        typeof data.token !== 'string' ||
        !('mode' in data) ||
        !['simulated', 'live'].includes(String(data.mode))
      ) {
        throw new Error('Invalid local app session response')
      }
      current()
      const mode = data.mode as Mode
      this.onMode(mode)
      if (mode === 'live') {
        // Permission succeeds before Bedrock starts, avoiding a billed session with no microphone.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        })
        if (this.run !== run) {
          stream.getTracks().forEach((track) => track.stop())
          current()
        }
        run.stream = stream
        stream.getAudioTracks().forEach((track) => {
          track.onended = () =>
            this.fail(run, new Error('Microphone disconnected. Start again to reconnect.'))
        })
        await context.audioWorklet.addModule('/pcm-capture.js')
        current()
        run.source = context.createMediaStreamSource(stream)
        run.worklet = new AudioWorkletNode(context, 'nova-pcm-capture')
        run.silence = context.createGain()
        run.silence.gain.value = 0
        run.source.connect(run.worklet)
        run.worklet.connect(run.silence)
        run.silence.connect(context.destination)
        run.worklet.onprocessorerror = () =>
          this.fail(run, new Error('Audio capture failed. Restart the session.'))
        run.worklet.port.onmessage = (message: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
          if (this.run !== run || !run.ready) return
          this.bridge.setInputVolume(id, Math.min(1, message.data.rms * 5))
          if (run.frames.length >= 20) {
            this.fail(run, new Error('Microphone transport stalled. Restart the session.'))
            return
          }
          run.frames.push(new Uint8Array(message.data.pcm))
          void this.drain(run)
        }
      }
      current()
      const socket = io({
        autoConnect: false,
        reconnection: false,
        transports: ['websocket'],
        auth: { token: data.token },
        timeout: 10_000,
      }) as Socket<ServerEvents, ClientEvents>
      run.socket = socket
      socket.on('nova:event', (sessionId, event, ack) => {
        if (this.run !== run || sessionId !== id) {
          ack({ ok: false, error: 'Previous app session' })
          return
        }
        try {
          this.bridge.handleEvent(id, event) // Clears audio synchronously on INTERRUPTED.
          run.player.handleEvent(event)
          ack({ ok: true })
        } catch (error) {
          ack({ ok: false, error: 'Browser playback failed' })
          this.fail(run, error)
        }
      })
      socket.on('nova:error', (sessionId, message) => {
        if (sessionId === id) this.fail(run, new Error(message))
      })
      socket.on('nova:closed', (sessionId) => {
        if (sessionId === id && this.run === run) void this.stop()
      })
      socket.on('disconnect', () => {
        if (this.run === run)
          this.fail(run, new Error('Connection ended. Start again for a new session.'))
      })
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Local socket connection timed out')),
          10_000,
        )
        const cleanup = () => {
          clearTimeout(timeout)
          socket.off('connect', connected)
          socket.off('connect_error', failed)
        }
        const connected = () => {
          cleanup()
          resolve()
        }
        const failed = (error: Error) => {
          cleanup()
          reject(error)
        }
        socket.once('connect', connected)
        socket.once('connect_error', failed)
        run.abort.signal.addEventListener(
          'abort',
          () => {
            cleanup()
            reject(new DOMException('Session stopped', 'AbortError'))
          },
          { once: true },
        )
        socket.connect()
      })
      current()
      await new Promise<void>((resolve, reject) => {
        socket.timeout(12_000).emit('nova:start', id, (error, result) => {
          if (error || !result?.ok)
            reject(new Error(result?.error ?? 'Voice session startup timed out'))
          else resolve()
        })
      })
      current()
      run.ready = true
      this.bridge.connected(id)
      context.onstatechange = () => {
        if (this.run === run && context.state === 'suspended') {
          this.fail(run, new Error('Browser paused audio. Start again to resume.'))
        }
      }
    } catch (error) {
      if (this.run === run) this.fail(run, error)
      else await this.dispose(run)
    }
  }

  private async drain(run: Run) {
    if (run.sending) return
    run.sending = true
    try {
      while (this.run === run && run.ready && run.frames.length && run.socket?.connected) {
        const frame = run.frames.shift()!
        await new Promise<void>((resolve, reject) => {
          run.socket!.timeout(1500).emit('nova:audio', run.id, frame, (error, result) => {
            if (error || !result?.ok)
              reject(new Error(result?.error ?? 'Microphone backpressure timeout'))
            else resolve()
          })
        })
      }
    } catch (error) {
      this.fail(run, error)
    } finally {
      run.sending = false
    }
  }

  simulate(action: 'speak' | 'interrupt' | 'error') {
    const run = this.run
    if (!run?.ready || !run.socket) return
    run.socket.timeout(1500).emit('nova:simulate', run.id, action, (error, result) => {
      if (error || !result?.ok)
        this.fail(run, new Error(result?.error ?? 'Simulation transport failed'))
    })
  }

  private fail(run: Run, error: unknown) {
    if (this.run !== run) return
    this.bridge.failed(run.id, error)
    this.run = null
    void this.dispose(run)
  }

  async stop() {
    const run = this.run
    if (!run) return
    this.run = null
    this.bridge.endSession(run.id)
    run.abort.abort()
    run.ready = false
    run.frames = []
    run.player.clear()
    run.stream?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    if (run.socket?.connected) {
      await new Promise<void>((resolve) => {
        run.socket!.timeout(1200).emit('nova:stop', run.id, () => resolve())
      })
    }
    await this.dispose(run)
  }

  private async dispose(run: Run) {
    if (run.disposed) return
    run.disposed = true
    run.abort.abort()
    run.ready = false
    run.frames = []
    run.context.onstatechange = null
    if (run.worklet) {
      run.worklet.port.onmessage = null
      run.worklet.onprocessorerror = null
      run.worklet.port.close()
      run.worklet.disconnect()
    }
    run.source?.disconnect()
    run.silence?.disconnect()
    run.stream?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    run.player.dispose()
    run.socket?.removeAllListeners()
    run.socket?.disconnect()
    if (run.context.state !== 'closed') await run.context.close()
  }
}
