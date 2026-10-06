import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { io, type Socket } from 'socket.io-client'
import { createRecipeServer } from '../server'
import type { ClientEvents, ServerEvents } from '../protocol'
import type { NovaSonicEvent } from 'orb-ui/adapters'

const origin = 'http://127.0.0.1:5174'

async function startServer(options: Parameters<typeof createRecipeServer>[0] = {}) {
  const server = createRecipeServer(options)
  server.http.listen(0, '127.0.0.1')
  await once(server.http, 'listening')
  const address = server.http.address()
  assert.ok(address && typeof address === 'object')
  const url = `http://127.0.0.1:${address.port}`
  return { ...server, url }
}

async function token(url: string) {
  const response = await fetch(`${url}/api/nova-session`, {
    method: 'POST',
    headers: { Origin: origin },
  })
  assert.equal(response.status, 200)
  const result = (await response.json()) as { token: string; mode: string; expiresAt: number }
  assert.equal(result.mode, 'simulated')
  assert.ok(result.expiresAt > Date.now())
  return result.token
}

function socket(url: string, appToken?: string) {
  return io(url, {
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Origin: origin },
    auth: { token: appToken },
  }) as Socket<ServerEvents, ClientEvents>
}

async function connect(client: Socket<ServerEvents, ClientEvents>) {
  const ready = new Promise<void>((resolve, reject) => {
    client.once('connect', resolve)
    client.once('connect_error', reject)
  })
  client.connect()
  await ready
}

function connectionError(client: Socket<ServerEvents, ClientEvents>) {
  return new Promise<Error>((resolve) => client.once('connect_error', resolve))
}

test('local token endpoint rejects untrusted origins, absent origins and non-loopback configuration', async () => {
  assert.throws(() => createRecipeServer({ browserOrigin: 'https://public.example' }), /loopback/)
  const server = await startServer()
  try {
    const wrong = await fetch(`${server.url}/api/nova-session`, {
      method: 'POST',
      headers: { Origin: 'https://public.example' },
    })
    assert.equal(wrong.status, 403)
    const absent = await fetch(`${server.url}/api/nova-session`, { method: 'POST' })
    assert.equal(absent.status, 403)
    const valid = await fetch(`${server.url}/api/nova-session`, {
      method: 'POST',
      headers: { Origin: origin },
    })
    assert.equal(valid.status, 200)
    assert.equal(valid.headers.get('cache-control'), 'no-store')
  } finally {
    await server.close()
  }
})

test('Socket.IO requires a single-use application token and defaults to zero-call simulation', async () => {
  const server = await startServer()
  const appToken = await token(server.url)
  const client = socket(server.url, appToken)
  const missing = socket(server.url)
  const reused = socket(server.url, appToken)
  try {
    const denied = connectionError(missing)
    missing.connect()
    assert.match((await denied).message, /token required/)
    const events: NovaSonicEvent[] = []
    client.on('nova:event', (_id, event, ack) => {
      events.push(event)
      ack({ ok: true })
    })
    await connect(client)
    assert.deepEqual(await client.timeout(2000).emitWithAck('nova:start', 'test-session'), {
      ok: true,
    })
    const repeated = await client.timeout(2000).emitWithAck('nova:start', 'test-session')
    assert.equal(repeated.ok, false)
    const received = new Promise<void>((resolve) => {
      client.on('nova:event', (_id, event) => {
        if (event.audioOutput) resolve()
      })
    })
    await received
    assert.ok(
      events.some(
        (event) => event.contentStart?.audioOutputConfiguration?.sampleRateHertz === 24000,
      ),
    )
    const interrupted = new Promise<void>((resolve) => {
      client.on('nova:event', (_id, event) => {
        if (event.contentEnd?.stopReason === 'INTERRUPTED') resolve()
      })
    })
    await client.timeout(2000).emitWithAck('nova:simulate', 'test-session', 'interrupt')
    await interrupted
    const disconnected = new Promise<void>((resolve) => client.once('disconnect', () => resolve()))
    await client.timeout(2000).emitWithAck('nova:stop', 'test-session')
    await disconnected
    const refused = connectionError(reused)
    reused.connect()
    assert.match((await refused).message, /expired or used/)
  } finally {
    client.disconnect()
    missing.disconnect()
    reused.disconnect()
    await server.close()
  }
})

test('invalid PCM is rejected and a disconnected browser cancels its app-owned session', async () => {
  let stopped = 0
  const server = await startServer({
    createSession: () => ({
      async start() {},
      async audio() {},
      async stop() {
        stopped++
      },
    }),
  })
  const client = socket(server.url, await token(server.url))
  try {
    await connect(client)
    await client.timeout(2000).emitWithAck('nova:start', 'test-session')
    const error = new Promise<string>((resolve) =>
      client.once('nova:error', (_id, message) => resolve(message)),
    )
    const result = await client
      .timeout(2000)
      .emitWithAck('nova:audio', 'test-session', new Uint8Array([0]))
    assert.equal(result.ok, false)
    assert.match(await error, /audio input/)
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(stopped, 1)
  } finally {
    client.disconnect()
    await server.close()
  }
})

test('backend construction failure is acknowledged and closes the socket without an unhandled rejection', async () => {
  const server = await startServer({
    createSession: () => {
      throw new Error('Synthetic backend construction failure')
    },
  })
  const client = socket(server.url, await token(server.url))
  try {
    await connect(client)
    const error = new Promise<string>((resolve) =>
      client.once('nova:error', (_id, message) => resolve(message)),
    )
    const result = await client.timeout(2000).emitWithAck('nova:start', 'test-session')
    assert.equal(result.ok, false)
    assert.match(await error, /construction failure/)
  } finally {
    client.disconnect()
    await server.close()
  }
})
