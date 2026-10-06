import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import {
  InvokeModelWithBidirectionalStreamCommand,
  type InvokeModelWithBidirectionalStreamCommandOutput,
  type InvokeModelWithBidirectionalStreamInput,
} from '@aws-sdk/client-bedrock-runtime'
import type { NovaSonicEvent } from 'orb-ui/adapters'
import { INPUT_RATE, MODEL_ID, OUTPUT_RATE, parseProviderEvent } from './protocol'

export type BedrockSend = (
  command: InvokeModelWithBidirectionalStreamCommand,
  options: { abortSignal: AbortSignal },
) => Promise<InvokeModelWithBidirectionalStreamCommandOutput>

/** Consumption acknowledgments provide backpressure instead of an unbounded microphone queue. */
export class InputQueue implements AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
  private items: Array<{
    value: InvokeModelWithBidirectionalStreamInput
    bytes: number
    resolve: () => void
    reject: (error: Error) => void
  }> = []
  private pendingBytes = 0
  private wake: (() => void) | null = null
  private closed = false
  private failure: Error | null = null

  constructor(private readonly maxBytes = 64 * 1024) {}

  push(event: Record<string, unknown>): Promise<void> {
    if (this.closed) return Promise.reject(this.failure ?? new Error('Input stream is closed'))
    const bytes = new TextEncoder().encode(JSON.stringify({ event }))
    if (this.pendingBytes + bytes.byteLength > this.maxBytes) {
      return Promise.reject(new Error('Microphone backpressure limit exceeded'))
    }
    return new Promise((resolve, reject) => {
      this.items.push({ value: { chunk: { bytes } }, bytes: bytes.byteLength, resolve, reject })
      this.pendingBytes += bytes.byteLength
      this.wake?.()
      this.wake = null
    })
  }

  close() {
    this.closed = true
    this.wake?.()
    this.wake = null
  }

  abort(error = new Error('Input stream aborted')) {
    this.failure = error
    this.closed = true
    this.items.splice(0).forEach((item) => item.reject(error))
    this.pendingBytes = 0
    this.wake?.()
    this.wake = null
  }

  async *[Symbol.asyncIterator]() {
    try {
      while (true) {
        const item = this.items.shift()
        if (item) {
          this.pendingBytes -= item.bytes
          item.resolve()
          yield item.value
        } else if (this.closed) {
          if (this.failure) throw this.failure
          return
        } else {
          await new Promise<void>((resolve) => (this.wake = resolve))
        }
      }
    } finally {
      this.abort()
    }
  }
}

export interface RecipeSession {
  start(): Promise<void>
  audio(pcm: Uint8Array): Promise<void>
  stop(graceful?: boolean): Promise<void>
}

export class BedrockSession implements RecipeSession {
  private readonly queue = new InputQueue()
  private readonly abort = new AbortController()
  private readonly promptName = randomUUID()
  private readonly audioName = randomUUID()
  private task: Promise<void> | null = null
  private started = false
  private stopping = false
  private stopTask: Promise<void> | null = null

  constructor(
    private readonly send: BedrockSend,
    private readonly onEvent: (event: NovaSonicEvent) => Promise<void>,
    private readonly onError: (error: unknown) => void,
    private readonly onClose: () => void,
  ) {}

  async start() {
    if (this.started) throw new Error('Session already started')
    this.started = true
    const systemName = randomUUID()
    const enqueue = (event: Record<string, unknown>) => {
      void this.queue.push(event).catch(() => undefined)
    }
    enqueue({
      sessionStart: {
        inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
        turnDetectionConfiguration: { endpointingSensitivity: 'MEDIUM' },
      },
    })
    enqueue({
      promptStart: {
        promptName: this.promptName,
        textOutputConfiguration: { mediaType: 'text/plain' },
        audioOutputConfiguration: {
          mediaType: 'audio/lpcm',
          sampleRateHertz: OUTPUT_RATE,
          sampleSizeBits: 16,
          channelCount: 1,
          encoding: 'base64',
          audioType: 'SPEECH',
          voiceId: 'tiffany',
        },
      },
    })
    enqueue({
      contentStart: {
        promptName: this.promptName,
        contentName: systemName,
        type: 'TEXT',
        role: 'SYSTEM',
        interactive: false,
        textInputConfiguration: { mediaType: 'text/plain' },
      },
    })
    enqueue({
      textInput: {
        promptName: this.promptName,
        contentName: systemName,
        content: 'Be a concise, friendly voice assistant. Answer in one or two sentences.',
      },
    })
    enqueue({ contentEnd: { promptName: this.promptName, contentName: systemName } })
    enqueue({
      contentStart: {
        promptName: this.promptName,
        contentName: this.audioName,
        type: 'AUDIO',
        role: 'USER',
        interactive: true,
        audioInputConfiguration: {
          mediaType: 'audio/lpcm',
          sampleRateHertz: INPUT_RATE,
          sampleSizeBits: 16,
          channelCount: 1,
          encoding: 'base64',
          audioType: 'SPEECH',
        },
      },
    })
    const command = new InvokeModelWithBidirectionalStreamCommand({
      modelId: MODEL_ID,
      body: this.queue,
    })
    const response = await this.send(command, { abortSignal: this.abort.signal }).catch((error) => {
      this.queue.abort()
      this.abort.abort()
      throw error
    })
    if (this.stopping || this.abort.signal.aborted) {
      this.queue.abort()
      throw new Error('Session stopped during startup')
    }
    if (!response.body) {
      this.queue.abort()
      throw new Error('Bedrock returned no response stream')
    }
    this.task = (async () => {
      try {
        for await (const packet of response.body!) {
          if (this.abort.signal.aborted) break
          if (packet.chunk?.bytes) {
            const event = parseProviderEvent(packet.chunk.bytes)
            if (Object.keys(event).length) await this.onEvent(event)
          } else {
            const exception = Object.entries(packet).find(([key]) => key !== '$unknown')
            throw new Error(`Bedrock stream failed: ${exception?.[0] ?? 'unknown event'}`)
          }
        }
      } catch (error) {
        if (!this.stopping) this.onError(error)
      } finally {
        this.queue.abort()
        this.abort.abort()
        if (!this.stopping) this.onClose()
      }
    })()
  }

  audio(pcm: Uint8Array) {
    if (this.stopping) return Promise.reject(new Error('Session is stopping'))
    return this.queue.push({
      audioInput: {
        promptName: this.promptName,
        contentName: this.audioName,
        content: Buffer.from(pcm).toString('base64'),
      },
    })
  }

  stop(graceful = true) {
    if (this.stopTask) return this.stopTask
    this.stopping = true
    this.stopTask = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          this.abort.abort()
          this.queue.abort()
          resolve()
        }, 1000)
      })
      try {
        const closing = async () => {
          if (graceful && !this.abort.signal.aborted) {
            await this.queue.push({
              contentEnd: { promptName: this.promptName, contentName: this.audioName },
            })
            await this.queue.push({ promptEnd: { promptName: this.promptName } })
            await this.queue.push({ sessionEnd: {} })
            this.queue.close()
            await this.task
          }
        }
        await Promise.race([closing(), deadline])
      } catch {
        // An already broken connection cannot receive graceful closing events.
      } finally {
        if (timeout) clearTimeout(timeout)
        this.abort.abort()
        this.queue.abort()
      }
    })()
    return this.stopTask
  }
}
