import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const markdown = readFileSync('demo/blog/posts/elevenlabs-conversational-ai-react.md', 'utf8')
const source = [...markdown.matchAll(/```ts\n([\s\S]*?)```/g)]
  .map((match) => match[1])
  .find((block) => block.includes('export function createVoice'))!

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

type Callbacks = {
  onDisconnect: () => void
  onMessage: (message: { role: string; message: string }) => void
  onInterruption: () => void
}
type Controller = { start: () => Promise<void>; stop: () => Promise<void> }

function harness() {
  const events = { phase: vi.fn(), mode: vi.fn(), message: vi.fn(), error: vi.fn() }
  const endSession = vi.fn().mockResolvedValue(undefined)
  const startSession = vi.fn().mockResolvedValue({ endSession })
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json({ token: 'short-lived-test-token' }))
  const exports: { createVoice?: (handlers: typeof events) => Controller } = {}
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(output, {
    exports,
    AbortController,
    Error,
    fetch,
    require: (name: string) => {
      if (name !== '@elevenlabs/client') throw new Error(`Unexpected import: ${name}`)
      return { Conversation: { startSession } }
    },
  })
  return { events, endSession, startSession, fetch, voice: exports.createVoice!(events) }
}

describe('published ElevenLabs tutorial lifecycle', () => {
  it('uses a conversation token, owns one session, forwards events, and stops cleanly', async () => {
    const h = harness()
    await h.voice.start()
    await h.voice.start()
    expect(h.startSession).toHaveBeenCalledOnce()
    expect(h.startSession.mock.calls[0][0]).toMatchObject({
      conversationToken: 'short-lived-test-token',
      connectionType: 'webrtc',
    })
    const callbacks = h.startSession.mock.calls[0][0] as Callbacks
    callbacks.onMessage({ role: 'agent', message: 'Hello' })
    callbacks.onInterruption()
    expect(h.events.message).toHaveBeenCalledWith('agent: Hello')
    expect(h.events.mode).toHaveBeenCalledWith('listening')
    await h.voice.stop()
    callbacks.onMessage({ role: 'agent', message: 'Late event' })
    expect(h.events.message).toHaveBeenCalledTimes(1)
    expect(h.endSession).toHaveBeenCalledOnce()
    expect(h.events.phase).toHaveBeenLastCalledWith('idle')
  })

  it('does not start the SDK after cancellation during token retrieval', async () => {
    const h = harness()
    const token = deferred<Response>()
    h.fetch.mockReturnValue(token.promise)
    const starting = h.voice.start()
    await h.voice.stop()
    expect(h.fetch.mock.calls[0][1].signal.aborted).toBe(true)
    token.resolve(Response.json({ token: 'unused-token' }))
    await starting
    expect(h.startSession).not.toHaveBeenCalled()
    expect(h.events.phase).toHaveBeenLastCalledWith('idle')
  })

  it('ends a late SDK session and prevents overlapping startup while stopping', async () => {
    const h = harness()
    const session = deferred<{ endSession: typeof h.endSession }>()
    h.startSession.mockReturnValue(session.promise)
    const starting = h.voice.start()
    await vi.waitFor(() => expect(h.startSession).toHaveBeenCalledOnce())
    await h.voice.stop()
    await h.voice.start()
    expect(h.startSession).toHaveBeenCalledOnce()
    session.resolve({ endSession: h.endSession })
    await starting
    expect(h.endSession).toHaveBeenCalledOnce()
    expect(h.events.phase).toHaveBeenLastCalledWith('idle')
  })

  it('recovers from SDK rejection and natural disconnect', async () => {
    const h = harness()
    h.startSession.mockRejectedValueOnce(new Error('Microphone denied'))
    await h.voice.start()
    expect(h.events.error).toHaveBeenLastCalledWith('Microphone denied')
    expect(h.events.phase).toHaveBeenLastCalledWith('idle')
    await h.voice.start()
    const callbacks = h.startSession.mock.calls[1][0] as Callbacks
    callbacks.onDisconnect()
    expect(h.events.phase).toHaveBeenLastCalledWith('idle')
    await h.voice.start()
    expect(h.startSession).toHaveBeenCalledTimes(3)
  })

  it('cleans up if the provider disconnects before startup resolves', async () => {
    const h = harness()
    h.startSession.mockImplementation(async (callbacks: Callbacks) => {
      callbacks.onDisconnect()
      return { endSession: h.endSession }
    })
    await h.voice.start()
    expect(h.endSession).toHaveBeenCalledOnce()
    expect(h.events.phase).toHaveBeenLastCalledWith('idle')
    expect(h.events.phase).not.toHaveBeenCalledWith('connected')
  })

  it('keeps startup locked if closing the prior session fails', async () => {
    const h = harness()
    h.endSession.mockRejectedValue(new Error('Cleanup failed'))
    await h.voice.start()
    await h.voice.stop()
    await h.voice.start()
    expect(h.startSession).toHaveBeenCalledOnce()
    expect(h.events.phase).toHaveBeenLastCalledWith('stopping')
    expect(h.events.error).toHaveBeenLastCalledWith(
      'Could not confirm session cleanup. Reload before reconnecting.',
    )
  })
})
