/** Shared PCM browser path for injected Azure sessions and Cartesia agent sockets. */
export interface PcmBrowserAudioOptions {
  mediaStreamConstraints?: MediaStreamConstraints
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  createAudioContext?: () => AudioContext
  /** Supply your existing AudioWorklet factory when your CSP disallows blob modules. */
  createCaptureNode?: (context: AudioContext) => Promise<AudioWorkletNode>
}

interface AudioOptions extends PcmBrowserAudioOptions {
  inputSampleRate: number
  outputSampleRate: number
  onInput: (bytes: Uint8Array, rms: number) => void
  onOutputVolume: (rms: number) => void
  onPlayback: (playing: boolean) => void
  onError: (error: unknown) => void
}

export interface PcmBrowserAudio {
  open(): Promise<void>
  play(bytes: Uint8Array): void
  clear(): void
  close(): Promise<void>
  readonly hasOutput: boolean
}

const CAPTURE_PROCESSOR = `
class OrbPcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.samples = new Float32Array(2048); this.offset = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (!channels || !channels.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let mono = 0;
      for (const channel of channels) mono += channel[i] / channels.length;
      this.samples[this.offset++] = mono;
      if (this.offset === this.samples.length) {
        this.port.postMessage(this.samples, [this.samples.buffer]);
        this.samples = new Float32Array(2048); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('orb-pcm-capture', OrbPcmCapture);
`

async function createCaptureNode(context: AudioContext) {
  if (!context.audioWorklet) throw new Error('AudioWorklet requires HTTPS or localhost.')
  const url = URL.createObjectURL(new Blob([CAPTURE_PROCESSOR], { type: 'text/javascript' }))
  try {
    await context.audioWorklet.addModule(url)
    return new AudioWorkletNode(context, 'orb-pcm-capture')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function pcmRms(samples: Float32Array) {
  if (samples.length === 0) return 0
  let energy = 0
  for (const value of samples) energy += value * value
  return Math.sqrt(energy / samples.length)
}

/** Streaming weighted resampling retains fractional frames across worklet chunks. */
export function createPcm16Encoder(sourceRate: number, targetRate: number) {
  const ratio = sourceRate / targetRate
  let weighted = 0
  let filled = 0
  return (samples: Float32Array) => {
    const output: number[] = []
    for (const sample of samples) {
      let remaining = 1
      while (remaining > 1e-8) {
        const weight = Math.min(remaining, ratio - filled)
        weighted += sample * weight
        filled += weight
        remaining -= weight
        if (filled >= ratio - 1e-8) {
          output.push(Math.max(-1, Math.min(1, weighted / ratio)))
          weighted = 0
          filled = 0
        }
      }
    }
    const bytes = new Uint8Array(output.length * 2)
    const view = new DataView(bytes.buffer)
    output.forEach((sample, index) => {
      view.setInt16(index * 2, sample < 0 ? sample * 32768 : sample * 32767, true)
    })
    return bytes
  }
}

export function decodePcm16(bytes: Uint8Array) {
  if (bytes.byteLength % 2 !== 0) throw new Error('PCM16 audio must contain whole samples.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const samples = new Float32Array(bytes.byteLength / 2)
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768
  return samples
}

export function encodeBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodeBase64(data: string) {
  const binary = atob(data)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/** Create/resume synchronously in the user's gesture, before any credential fetch. */
export function createPcmBrowserAudio(options: AudioOptions): PcmBrowserAudio {
  const context = (options.createAudioContext ?? (() => new AudioContext()))()
  const resumed = context.state === 'suspended' ? context.resume() : Promise.resolve()
  // Permission can resolve after close; open() releases that late stream immediately.
  let disposed = false
  let stream: MediaStream | undefined
  let capture: AudioWorkletNode | undefined
  let input: MediaStreamAudioSourceNode | undefined
  let mute: GainNode | undefined
  let analyser: AnalyserNode | undefined
  let meter: ReturnType<typeof setInterval> | undefined
  let nextOutputTime = 0
  const sources = new Set<AudioBufferSourceNode>()
  const encode = createPcm16Encoder(context.sampleRate, options.inputSampleRate)
  const microphoneEnded = () => {
    if (!disposed) options.onError(new Error('The microphone track ended.'))
  }

  function check() {
    if (disposed) throw new DOMException('Audio startup canceled.', 'AbortError')
  }

  function clear() {
    sources.forEach((source) => {
      source.onended = null
      try {
        source.stop()
      } catch {
        // A completed source may already be stopped.
      }
      source.disconnect()
    })
    sources.clear()
    nextOutputTime = context.currentTime
    options.onOutputVolume(0)
    options.onPlayback(false)
  }

  return {
    clear,
    get hasOutput() {
      return sources.size > 0
    },
    async open() {
      await resumed
      check()
      const getUserMedia =
        options.getUserMedia ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints))
      const acquired = await getUserMedia(
        options.mediaStreamConstraints ?? {
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        },
      )
      if (disposed) {
        acquired.getTracks().forEach((track) => track.stop())
        check()
      }
      stream = acquired
      stream.getTracks().forEach((track) => track.addEventListener('ended', microphoneEnded))
      capture = await (options.createCaptureNode ?? createCaptureNode)(context)
      if (disposed) {
        capture.port.close()
        capture.disconnect()
        check()
      }
      input = context.createMediaStreamSource(stream)
      mute = context.createGain()
      mute.gain.value = 0
      input.connect(capture)
      capture.connect(mute)
      mute.connect(context.destination)
      capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (disposed) return
        try {
          const samples = event.data
          if (!(samples instanceof Float32Array)) throw new Error('Invalid microphone PCM frame.')
          const bytes = encode(samples)
          if (bytes.byteLength) options.onInput(bytes, pcmRms(samples))
        } catch (error) {
          options.onError(error)
        }
      }
      capture.onprocessorerror = () => {
        if (!disposed) options.onError(new Error('The microphone AudioWorklet failed.'))
      }
      analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.connect(context.destination)
      const samples = new Float32Array(analyser.fftSize)
      meter = setInterval(() => {
        if (disposed || !analyser) return
        analyser.getFloatTimeDomainData(samples)
        options.onOutputVolume(pcmRms(samples))
      }, 33)
    },
    play(bytes) {
      if (disposed || !analyser || bytes.byteLength === 0) return
      if (nextOutputTime - context.currentTime > 5) {
        throw new Error('Audio playback fell more than five seconds behind.')
      }
      const samples = decodePcm16(bytes)
      const buffer = context.createBuffer(1, samples.length, options.outputSampleRate)
      buffer.getChannelData(0).set(samples)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(analyser)
      const startAt = Math.max(context.currentTime, nextOutputTime)
      nextOutputTime = startAt + buffer.duration
      sources.add(source)
      source.onended = () => {
        if (!sources.delete(source)) return
        source.disconnect()
        if (!disposed && sources.size === 0) options.onPlayback(false)
      }
      source.start(startAt)
      options.onPlayback(true)
    },
    async close() {
      if (disposed) return
      disposed = true
      clear()
      if (meter) clearInterval(meter)
      if (capture) {
        capture.port.onmessage = null
        capture.onprocessorerror = null
        capture.port.close()
        capture.disconnect()
      }
      input?.disconnect()
      mute?.disconnect()
      analyser?.disconnect()
      stream?.getTracks().forEach((track) => {
        track.removeEventListener('ended', microphoneEnded)
        track.stop()
      })
      if (context.state !== 'closed') await context.close()
    },
  }
}
