import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { NodeHttp2Handler } from '@smithy/node-http-handler'
import { Server } from 'socket.io'
import { BedrockSession, type RecipeSession } from './bedrock'
import {
  MAX_AUDIO_BYTES,
  MAX_SESSION_MS,
  MODEL_ID,
  type ClientEvents,
  type Mode,
  type ServerEvents,
} from './protocol'
import { SimulatedSession } from './simulated'
import type { NovaSonicEvent } from 'orb-ui/adapters'

interface Options {
  mode?: Mode
  browserOrigin?: string
  /** Injection for offline transport tests; production uses the real AWS SDK. */
  createSession?: (
    onEvent: (event: NovaSonicEvent) => Promise<void>,
    onError: (error: unknown) => void,
    onClose: () => void,
  ) => RecipeSession
}

export function createRecipeServer(options: Options = {}) {
  const mode = options.mode ?? 'simulated'
  const browserOrigin = options.browserOrigin ?? 'http://127.0.0.1:5174'
  const parsedOrigin = new URL(browserOrigin)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsedOrigin.hostname)) {
    throw new Error('This local recipe only accepts a loopback browser origin')
  }
  const tokens = new Map<string, number>()
  let activeConnections = 0
  let lastTokenAt = 0
  let bedrock: BedrockRuntimeClient | null = null
  const validHost = (host: string | undefined) => {
    const address = http.address()
    return typeof address === 'object' && address !== null && host === `127.0.0.1:${address.port}`
  }
  const http = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json')
    if (
      request.method !== 'POST' ||
      request.url !== '/api/nova-session' ||
      request.headers.origin !== browserOrigin ||
      !validHost(request.headers.host)
    ) {
      response.writeHead(403).end(JSON.stringify({ error: 'Local origin required' }))
      return
    }
    const now = Date.now()
    for (const [token, expiry] of tokens) if (expiry <= now) tokens.delete(token)
    if (activeConnections || tokens.size >= 8 || now - lastTokenAt < 1000) {
      response
        .writeHead(429)
        .end(JSON.stringify({ error: 'One local session at a time; try again shortly' }))
      return
    }
    lastTokenAt = now
    const token = randomBytes(32).toString('base64url')
    tokens.set(token, now + 60_000)
    response.end(JSON.stringify({ token, expiresAt: now + 60_000, mode, model: MODEL_ID }))
  })
  const io = new Server<ClientEvents, ServerEvents>(http, {
    transports: ['websocket'],
    maxHttpBufferSize: MAX_AUDIO_BYTES + 1024,
    cors: { origin: browserOrigin },
    allowRequest: (request, callback) => {
      callback(null, request.headers.origin === browserOrigin && validHost(request.headers.host))
    },
  })
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth.token
    if (typeof token !== 'string') return next(new Error('App session token required'))
    const expiry = tokens.get(token)
    tokens.delete(token) // Single use, scoped to one fixed model and one loopback-origin connection.
    if (!expiry || expiry <= Date.now() || activeConnections)
      return next(new Error('App session token expired or used'))
    activeConnections += 1
    next()
  })
  io.on('connection', (socket) => {
    let session: RecipeSession | null = null
    let sessionId: string | null = null
    let closed = false
    let maxDuration: ReturnType<typeof setTimeout> | null = null
    let availableBytes = 64_000
    let lastAudioAt = Date.now()
    const close = async (graceful: boolean) => {
      if (closed) return
      closed = true
      if (maxDuration) clearTimeout(maxDuration)
      maxDuration = null
      const stopping = session
      session = null
      await stopping?.stop(graceful)
    }
    const fail = (error: unknown) => {
      if (closed || !sessionId) return
      const message = error instanceof Error ? error.message : 'Voice session failed'
      // Provider credentials and full AWS exception objects never enter the browser.
      socket.emit('nova:error', sessionId, message.slice(0, 240))
      void close(false).finally(() => socket.disconnect(true))
    }
    socket.on('nova:start', async (id, ack) => {
      if (typeof ack !== 'function') return
      if (closed || session || typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) {
        ack({ ok: false, error: 'Session already started or invalid ID' })
        return
      }
      sessionId = id
      const onEvent = async (event: NovaSonicEvent) => {
        if (closed) return
        await new Promise<void>((resolve, reject) => {
          socket.timeout(5000).emit('nova:event', id, event, (error, result) => {
            if (error || !result?.ok)
              reject(new Error(result?.error ?? 'Browser output backpressure timeout'))
            else resolve()
          })
        })
      }
      const onClose = () => {
        if (closed) return
        socket.emit('nova:closed', id, 'Bedrock stream ended')
        void close(false).finally(() => socket.disconnect(true))
      }
      const create =
        options.createSession ??
        ((emit, onError, ended) => {
          if (mode === 'simulated') return new SimulatedSession(emit)
          bedrock ??= new BedrockRuntimeClient({
            region: process.env.AWS_REGION ?? 'us-east-1',
            requestHandler: new NodeHttp2Handler({
              requestTimeout: MAX_SESSION_MS,
              sessionTimeout: MAX_SESSION_MS,
            }),
            // Credentials come from the server's default AWS chain, never a socket message.
          })
          return new BedrockSession(
            (command, requestOptions) => bedrock!.send(command, requestOptions),
            emit,
            onError,
            ended,
          )
        })
      session = create(onEvent, fail, onClose)
      const startupTimeout = setTimeout(
        () => fail(new Error('Voice session startup timed out')),
        10_000,
      )
      maxDuration = setTimeout(() => {
        socket.emit('nova:closed', id, 'Five-minute local session limit reached')
        void close(true).finally(() => socket.disconnect(true))
      }, MAX_SESSION_MS)
      try {
        await session.start()
        if (closed) throw new Error('Session stopped during startup')
        ack({ ok: true })
      } catch (error) {
        ack({ ok: false, error: 'Could not start the voice session' })
        fail(error)
      } finally {
        clearTimeout(startupTimeout)
      }
    })
    socket.on('nova:audio', async (id, pcm, ack) => {
      if (typeof ack !== 'function') return
      const now = Date.now()
      availableBytes = Math.min(64_000, availableBytes + (now - lastAudioAt) * 64)
      lastAudioAt = now
      if (
        closed ||
        !session ||
        id !== sessionId ||
        !Buffer.isBuffer(pcm) ||
        pcm.byteLength === 0 ||
        pcm.byteLength > MAX_AUDIO_BYTES ||
        pcm.byteLength % 2 ||
        availableBytes < pcm.byteLength
      ) {
        ack({ ok: false, error: 'Invalid or excessive 16 kHz PCM input' })
        fail(new Error('Invalid or excessive audio input'))
        return
      }
      availableBytes -= pcm.byteLength
      try {
        await session.audio(pcm)
        ack({ ok: true })
      } catch (error) {
        ack({ ok: false, error: 'Microphone stream failed' })
        fail(error)
      }
    })
    socket.on('nova:stop', async (id, ack) => {
      if (typeof ack !== 'function') return
      if (id !== sessionId) {
        ack({ ok: false, error: 'Session ID mismatch' })
        return
      }
      await close(true)
      ack({ ok: true })
      socket.disconnect(true)
    })
    socket.on('nova:simulate', (id, action, ack) => {
      if (typeof ack !== 'function') return
      if (closed || id !== sessionId || !(session instanceof SimulatedSession)) {
        ack({ ok: false, error: 'Simulation is available only in simulated mode' })
        return
      }
      if (action === 'error') {
        ack({ ok: true })
        fail(new Error('Simulated connection failure. Start again to reconnect.'))
      } else if (action === 'speak' || action === 'interrupt') {
        void session[action]().catch(fail)
        ack({ ok: true })
      } else ack({ ok: false, error: 'Unknown simulation action' })
    })
    socket.on('disconnect', () => {
      activeConnections = Math.max(0, activeConnections - 1)
      void close(false)
    })
  })
  return {
    http,
    io,
    async close() {
      tokens.clear()
      await new Promise<void>((resolve) => io.close(() => resolve()))
      bedrock?.destroy()
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.env.NOVA_ENABLE_LIVE === '1' ? 'live' : 'simulated'
  const server = createRecipeServer({ mode, browserOrigin: process.env.NOVA_BROWSER_ORIGIN })
  server.http.listen(3001, '127.0.0.1', () => {
    console.info(`Nova recipe: ${mode}. Backend is loopback-only at http://127.0.0.1:3001`)
    console.info(
      'Open http://127.0.0.1:5174 after npm run dev. Live mode bills your own AWS account.',
    )
  })
  const shutdown = () => void server.close().finally(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
