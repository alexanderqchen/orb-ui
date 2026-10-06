/* global AudioWorkletProcessor, registerProcessor, sampleRate */

// Continuous box-filter resampling: the accumulator survives render block boundaries.
// Output is 512 mono signed PCM16 little-endian samples (32 ms at 16 kHz).
class NovaPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000
    this.remaining = this.ratio
    this.sum = 0
    this.frame = new ArrayBuffer(1024)
    this.view = new DataView(this.frame)
    this.index = 0
    this.energy = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    for (const input of channel) {
      let available = 1
      while (available > 0.000001) {
        const take = Math.min(available, this.remaining)
        this.sum += input * take
        this.remaining -= take
        available -= take
        if (this.remaining < 0.000001) {
          const sample = Math.max(-1, Math.min(1, this.sum / this.ratio))
          this.view.setInt16(
            this.index * 2,
            Math.round(sample * (sample < 0 ? 32768 : 32767)),
            true,
          )
          this.energy += sample * sample
          this.index += 1
          this.remaining = this.ratio
          this.sum = 0
          if (this.index === 512) {
            const frame = this.frame
            this.port.postMessage({ pcm: frame, rms: Math.sqrt(this.energy / 512) }, [frame])
            this.frame = new ArrayBuffer(1024)
            this.view = new DataView(this.frame)
            this.index = 0
            this.energy = 0
          }
        }
      }
    }
    return true
  }
}

registerProcessor('nova-pcm-capture', NovaPcmCapture)
