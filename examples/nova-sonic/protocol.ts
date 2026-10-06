import type { NovaSonicEvent } from 'orb-ui/adapters'

export const INPUT_RATE = 16_000
export const OUTPUT_RATE = 24_000
export const MODEL_ID = 'amazon.nova-2-sonic-v1:0'
export const MAX_SESSION_MS = 5 * 60_000
export const MAX_AUDIO_BYTES = 2048
export type Mode = 'simulated' | 'live'
export type Ack = (result: { ok: boolean; error?: string }) => void

export interface ClientEvents {
  'nova:start': (sessionId: string, ack: Ack) => void
  'nova:audio': (sessionId: string, pcm: Uint8Array, ack: Ack) => void
  'nova:stop': (sessionId: string, ack: Ack) => void
  'nova:simulate': (sessionId: string, action: 'speak' | 'interrupt' | 'error', ack: Ack) => void
}

export interface ServerEvents {
  'nova:event': (sessionId: string, event: NovaSonicEvent, ack: Ack) => void
  'nova:closed': (sessionId: string, reason: string) => void
  'nova:error': (sessionId: string, message: string) => void
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** AWS provides typed byte envelopes; Nova's model-specific JSON needs runtime validation. */
export function parseProviderEvent(bytes: Uint8Array): NovaSonicEvent {
  if (bytes.byteLength > 256 * 1024) throw new Error('Provider event exceeds the recipe limit')
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (!record(parsed) || !record(parsed.event)) throw new Error('Invalid provider event envelope')
  const event = parsed.event
  const result: NovaSonicEvent = {}
  if (record(event.contentStart)) {
    const value = event.contentStart
    if (
      typeof value.contentId !== 'string' ||
      !['TEXT', 'AUDIO', 'TOOL'].includes(String(value.type)) ||
      !['USER', 'ASSISTANT', 'TOOL'].includes(String(value.role))
    ) {
      throw new Error('Invalid provider contentStart')
    }
    result.contentStart = {
      contentId: value.contentId,
      type: value.type as 'TEXT' | 'AUDIO' | 'TOOL',
      role: value.role as 'USER' | 'ASSISTANT' | 'TOOL',
      ...(typeof value.additionalModelFields === 'string'
        ? { additionalModelFields: value.additionalModelFields }
        : {}),
    }
    if (record(value.audioOutputConfiguration)) {
      const rate = value.audioOutputConfiguration.sampleRateHertz
      if (typeof rate !== 'number' || ![8000, 16000, 24000].includes(rate)) {
        throw new Error('Unsupported provider PCM sample rate')
      }
      result.contentStart.audioOutputConfiguration = { sampleRateHertz: rate }
    }
  }
  for (const key of ['textOutput', 'audioOutput'] as const) {
    if (record(event[key])) {
      const value = event[key]
      if (typeof value.contentId !== 'string' || typeof value.content !== 'string') {
        throw new Error(`Invalid provider ${key}`)
      }
      result[key] = { contentId: value.contentId, content: value.content }
    }
  }
  if (record(event.contentEnd)) {
    const value = event.contentEnd
    if (typeof value.contentId !== 'string') throw new Error('Invalid provider contentEnd')
    result.contentEnd = {
      contentId: value.contentId,
      ...(typeof value.type === 'string' ? { type: value.type } : {}),
      ...(typeof value.stopReason === 'string' ? { stopReason: value.stopReason } : {}),
    }
  }
  if (record(event.completionStart)) result.completionStart = {}
  if (record(event.completionEnd)) {
    result.completionEnd = {
      ...(typeof event.completionEnd.stopReason === 'string'
        ? { stopReason: event.completionEnd.stopReason }
        : {}),
    }
  }
  // usageEvent and future provider extensions can pass through the stream without changing UI.
  return result
}
