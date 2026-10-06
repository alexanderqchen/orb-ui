import type { NovaSonicEvent } from 'orb-ui/adapters'
import { OUTPUT_RATE } from './protocol'

export function decodePcm16(base64: string) {
  const binary = atob(base64)
  if (!binary.length || binary.length % 2) throw new Error('Invalid mono PCM16 output')
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const samples = new Float32Array(bytes.length / 2)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768
  }
  return samples
}

export class PcmPlayer {
  private readonly sources = new Set<AudioBufferSourceNode>()
  private readonly rates = new Map<string, number>()
  private readonly interrupted = new Set<string>()
  private currentContent: string | null = null
  private nextTime = 0
  private readonly analyser: AnalyserNode
  private readonly meter: ReturnType<typeof setInterval>

  constructor(
    private readonly context: AudioContext,
    private readonly update: (active: boolean, volume: number) => void,
  ) {
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.connect(context.destination)
    const samples = new Float32Array(this.analyser.fftSize)
    this.meter = setInterval(() => {
      this.analyser.getFloatTimeDomainData(samples)
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
      this.update(this.sources.size > 0, Math.min(1, rms * 5))
    }, 33)
  }

  handleEvent(event: NovaSonicEvent) {
    if (event.contentStart?.type === 'AUDIO') {
      const { contentId, audioOutputConfiguration } = event.contentStart
      this.currentContent = contentId
      this.rates.set(contentId, audioOutputConfiguration?.sampleRateHertz ?? OUTPUT_RATE)
      if (this.rates.size > 128) this.rates.delete(this.rates.keys().next().value!)
    }
    const audio = event.audioOutput
    if (audio && !this.interrupted.has(audio.contentId)) {
      const samples = decodePcm16(audio.content)
      const rate = this.rates.get(audio.contentId)
      if (!rate) throw new Error('Audio arrived before its contentStart')
      // Bound generated-ahead audio; a stalled/background tab must terminate rather than grow forever.
      const startAt = Math.max(this.context.currentTime + 0.015, this.nextTime)
      if (startAt + samples.length / rate - this.context.currentTime > 10) {
        throw new Error('Playback queue exceeded ten seconds; restart the session')
      }
      const buffer = this.context.createBuffer(1, samples.length, rate)
      buffer.getChannelData(0).set(samples)
      const source = this.context.createBufferSource()
      source.buffer = buffer
      source.connect(this.analyser)
      this.nextTime = startAt + buffer.duration
      this.sources.add(source)
      source.onended = () => {
        this.sources.delete(source)
        source.disconnect()
        this.update(this.sources.size > 0, 0)
      }
      source.start(startAt)
      this.update(true, 0)
    }
  }

  interrupt() {
    if (this.currentContent) {
      this.interrupted.add(this.currentContent)
      if (this.interrupted.size > 128)
        this.interrupted.delete(this.interrupted.values().next().value!)
    }
    this.clear()
  }

  clear() {
    this.sources.forEach((source) => {
      source.onended = null
      try {
        source.stop()
      } catch {
        /* A source may already have ended. */
      }
      source.disconnect()
    })
    this.sources.clear()
    this.nextTime = this.context.currentTime
    this.update(false, 0)
  }

  dispose() {
    clearInterval(this.meter)
    this.clear()
    this.analyser.disconnect()
    this.rates.clear()
    this.interrupted.clear()
  }
}
