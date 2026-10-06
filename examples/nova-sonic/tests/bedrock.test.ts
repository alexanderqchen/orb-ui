import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { test } from 'node:test'
import {
  ValidationException,
  type InvokeModelWithBidirectionalStreamOutput,
} from '@aws-sdk/client-bedrock-runtime'
import { BedrockSession, InputQueue, type BedrockSend } from '../bedrock'
import { INPUT_RATE, MODEL_ID, OUTPUT_RATE, parseProviderEvent } from '../protocol'

function bytes(event: Record<string, unknown>) {
  return new TextEncoder().encode(JSON.stringify({ event }))
}

test('bounded input queue acknowledges consumption and rejects overload or aborted producers', async () => {
  const queue = new InputQueue(256)
  const consumed = queue.push({ audioInput: { content: 'AA==' } })
  const iterator = queue[Symbol.asyncIterator]()
  const packet = await iterator.next()
  await consumed
  assert.equal(new TextDecoder().decode(packet.value?.chunk?.bytes).includes('audioInput'), true)
  await assert.rejects(queue.push({ audioInput: { content: 'a'.repeat(300) } }), /backpressure/)
  const pending = queue.push({ audioInput: { content: 'AA==' } })
  const rejected = assert.rejects(pending, /aborted/)
  queue.abort()
  await rejected
  await assert.rejects(iterator.next(), /aborted/)
})

test('real AWS command types contain ordered startup, continuous input, and graceful shutdown', async () => {
  const input: Array<Record<string, Record<string, unknown>>> = []
  let inputTask: Promise<void> = Promise.resolve()
  let endOutput!: () => void
  const outputEnd = new Promise<void>((resolve) => (endOutput = resolve))
  const output: InvokeModelWithBidirectionalStreamOutput[] = [
    {
      chunk: {
        bytes: bytes({
          contentStart: {
            contentId: 'u',
            role: 'USER',
            type: 'TEXT',
            additionalModelFields: '{"generationStage":"FINAL"}',
          },
        }),
      },
    },
    {
      chunk: { bytes: bytes({ textOutput: { contentId: 'u', content: 'A synthetic request.' } }) },
    },
    {
      chunk: {
        bytes: bytes({ contentEnd: { contentId: 'u', type: 'TEXT', stopReason: 'END_TURN' } }),
      },
    },
  ]
  let requestSignal!: AbortSignal
  const send: BedrockSend = async (command, options) => {
    assert.equal(command.input.modelId, MODEL_ID)
    requestSignal = options.abortSignal
    inputTask = (async () => {
      for await (const item of command.input.body!) {
        if (!item.chunk?.bytes) throw new Error('Expected a real AWS chunk input')
        const envelope = JSON.parse(new TextDecoder().decode(item.chunk.bytes))
        input.push(envelope.event)
        if (envelope.event.sessionEnd) endOutput()
      }
    })()
    return {
      $metadata: {},
      body: (async function* () {
        yield* output
        await outputEnd
      })(),
    }
  }
  const events: ReturnType<typeof parseProviderEvent>[] = []
  const errors: unknown[] = []
  let closed = 0
  const session = new BedrockSession(
    send,
    async (event) => {
      events.push(event)
    },
    (error) => errors.push(error),
    () => closed++,
  )
  await session.start()
  await assert.rejects(session.start(), /already started/)
  const pcm = Uint8Array.from([0, 0, 255, 127])
  await session.audio(pcm)
  await session.stop()
  await inputTask
  assert.deepEqual(
    input.map((event) => Object.keys(event)[0]),
    [
      'sessionStart',
      'promptStart',
      'contentStart',
      'textInput',
      'contentEnd',
      'contentStart',
      'audioInput',
      'contentEnd',
      'promptEnd',
      'sessionEnd',
    ],
  )
  const outputConfig = input[1].promptStart.audioOutputConfiguration as Record<string, unknown>
  const inputConfig = input[5].contentStart.audioInputConfiguration as Record<string, unknown>
  assert.equal(outputConfig.sampleRateHertz, OUTPUT_RATE)
  assert.equal(inputConfig.sampleRateHertz, INPUT_RATE)
  assert.equal(input[6].audioInput.content, Buffer.from(pcm).toString('base64'))
  assert.equal(input[5].contentStart.contentName, input[6].audioInput.contentName)
  assert.equal(input[5].contentStart.contentName, input[7].contentEnd.contentName)
  assert.equal(events[1].textOutput?.contentId, 'u')
  assert.equal(errors.length, 0)
  assert.equal(closed, 0)
  assert.equal(requestSignal.aborted, true)
  await session.stop() // Idempotent repeated stop.
  await assert.rejects(session.audio(pcm), /stopping/)
})

test('stop resolves within its deadline even when the output iterator ignores abort', async () => {
  const never = new Promise<void>(() => undefined)
  let inputTask: Promise<void> = Promise.resolve()
  let signal!: AbortSignal
  const send: BedrockSend = async (command, options) => {
    signal = options.abortSignal
    inputTask = (async () => {
      for await (const item of command.input.body!) void item
    })()
    return {
      $metadata: {},
      body: (async function* () {
        await never
        yield { chunk: { bytes: bytes({ completionEnd: {} }) } }
      })(),
    }
  }
  const session = new BedrockSession(
    send,
    async () => undefined,
    () => undefined,
    () => undefined,
  )
  await session.start()
  const before = Date.now()
  await session.stop()
  assert.ok(
    Date.now() - before < 1500,
    'stop must not await an unresponsive output iterator indefinitely',
  )
  assert.equal(signal.aborted, true)
  await inputTask
})

test('provider stream exceptions trigger error cleanup without forwarding secret-bearing objects', async () => {
  let signal!: AbortSignal
  const failure: InvokeModelWithBidirectionalStreamOutput = {
    validationException: new ValidationException({
      message: 'synthetic provider detail',
      $metadata: {},
    }),
  }
  const send: BedrockSend = async (_command, options) => {
    signal = options.abortSignal
    return {
      $metadata: {},
      body: (async function* () {
        yield failure
      })(),
    }
  }
  let received: unknown
  const session = new BedrockSession(
    send,
    async () => undefined,
    (error) => {
      received = error
    },
    () => undefined,
  )
  await session.start()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.ok(received instanceof Error)
  assert.equal(received.message, 'Bedrock stream failed: validationException')
  assert.equal(signal.aborted, true)
})

test('failed startup and stop during startup abort the underlying AWS request', async () => {
  let signal!: AbortSignal
  const rejected = new BedrockSession(
    async (_command, options) => {
      signal = options.abortSignal
      throw new Error('synthetic startup rejection')
    },
    async () => undefined,
    () => undefined,
    () => undefined,
  )
  await assert.rejects(rejected.start(), /startup rejection/)
  assert.equal(signal.aborted, true)

  let finish!: () => void
  const pending = new Promise<void>((resolve) => (finish = resolve))
  const delayed = new BedrockSession(
    async (_command, options) => {
      signal = options.abortSignal
      await pending
      return {
        $metadata: {},
        body: (async function* () {
          yield { chunk: { bytes: bytes({ completionEnd: {} }) } }
        })(),
      }
    },
    async () => undefined,
    () => undefined,
    () => undefined,
  )
  const started = delayed.start()
  const result = assert.rejects(started, /stopped during startup/)
  await delayed.stop(false)
  finish()
  await result
  assert.equal(signal.aborted, true)
})

test('model JSON validates current output contentId/rates and tolerates usage extensions', () => {
  assert.deepEqual(parseProviderEvent(bytes({ usageEvent: { totalTokens: 1 } })), {})
  assert.equal(
    parseProviderEvent(bytes({ audioOutput: { contentId: 'audio', content: 'AAA=' } })).audioOutput
      ?.contentId,
    'audio',
  )
  assert.throws(
    () =>
      parseProviderEvent(bytes({ textOutput: { contentName: 'wrong identifier', content: 'x' } })),
    /textOutput/,
  )
  assert.throws(
    () =>
      parseProviderEvent(
        bytes({
          contentStart: {
            contentId: 'a',
            type: 'AUDIO',
            role: 'ASSISTANT',
            audioOutputConfiguration: { sampleRateHertz: 48000 },
          },
        }),
      ),
    /sample rate/,
  )
  assert.throws(() => parseProviderEvent(new TextEncoder().encode('{"event":null}')), /envelope/)
})
