import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import type { NovaSonicEvent } from 'orb-ui/adapters'
import type { RecipeSession } from './bedrock'
import { OUTPUT_RATE } from './protocol'

/** A synthetic tone fixture, never a provider request or generated speech. */
export function toneFixture(durationSeconds = 0.08) {
  const bytes = Buffer.alloc(Math.round(OUTPUT_RATE * durationSeconds) * 2)
  for (let index = 0; index < bytes.byteLength / 2; index += 1) {
    const envelope = Math.sin((index / (bytes.byteLength / 2)) * Math.PI)
    bytes.writeInt16LE(
      Math.round(Math.sin((index * 2 * Math.PI * 220) / OUTPUT_RATE) * 2500 * envelope),
      index * 2,
    )
  }
  return bytes.toString('base64')
}

export class SimulatedSession implements RecipeSession {
  private closed = false
  private sequence = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly onEvent: (event: NovaSonicEvent) => Promise<void>) {}

  async start() {
    this.timer = setTimeout(() => void this.speak().catch(() => undefined), 300)
  }

  async audio() {
    // Default simulation never captures a microphone or invokes AWS.
  }

  async speak() {
    const sequence = ++this.sequence
    const textId = randomUUID()
    const audioId = randomUUID()
    const send = async (event: NovaSonicEvent) => {
      if (this.closed || this.sequence !== sequence) return false
      await this.onEvent(event)
      return true
    }
    await send({
      contentStart: {
        contentId: textId,
        role: 'USER',
        type: 'TEXT',
        additionalModelFields: '{"generationStage":"FINAL"}',
      },
    })
    await send({
      textOutput: { contentId: textId, content: 'Show me the local Nova Sonic recipe.' },
    })
    await send({ contentEnd: { contentId: textId, type: 'TEXT', stopReason: 'END_TURN' } })
    await send({
      contentStart: {
        contentId: audioId,
        type: 'AUDIO',
        role: 'ASSISTANT',
        audioOutputConfiguration: { sampleRateHertz: OUTPUT_RATE },
      },
    })
    for (let index = 0; index < 16; index += 1) {
      if (!(await send({ audioOutput: { contentId: audioId, content: toneFixture() } }))) return
      await new Promise<void>((resolve) => setTimeout(resolve, 50))
    }
    await send({ contentEnd: { contentId: audioId, type: 'AUDIO', stopReason: 'END_TURN' } })
    const finalId = randomUUID()
    await send({
      contentStart: {
        contentId: finalId,
        role: 'ASSISTANT',
        type: 'TEXT',
        additionalModelFields: '{"generationStage":"FINAL"}',
      },
    })
    await send({
      textOutput: {
        contentId: finalId,
        content: 'This is a simulated transcript with a local tone fixture. No AWS call was made.',
      },
    })
    await send({ contentEnd: { contentId: finalId, type: 'TEXT', stopReason: 'END_TURN' } })
    await send({ completionEnd: { stopReason: 'END_TURN' } })
  }

  async interrupt() {
    this.sequence += 1
    await this.onEvent({
      contentEnd: { contentId: 'simulated-interruption', type: 'TEXT', stopReason: 'INTERRUPTED' },
    })
  }

  async stop() {
    this.closed = true
    this.sequence += 1
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
