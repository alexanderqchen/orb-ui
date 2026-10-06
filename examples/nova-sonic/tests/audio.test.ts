import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import { decodePcm16, PcmPlayer } from '../audio'
import { toneFixture } from '../simulated'

function fakeContext() {
  const sources: Array<{
    stopped: number
    onended: (() => void) | null
    start: (time: number) => void
  }> = []
  const rates: number[] = []
  const context = {
    currentTime: 0,
    destination: {},
    createAnalyser: () => ({
      fftSize: 512,
      connect() {},
      disconnect() {},
      getFloatTimeDomainData(array: Float32Array) {
        array.fill(0)
      },
    }),
    createBuffer: (_channels: number, length: number, rate: number) => {
      rates.push(rate)
      const data = new Float32Array(length)
      return { duration: length / rate, getChannelData: () => data }
    },
    createBufferSource: () => {
      const source = {
        stopped: 0,
        buffer: null,
        onended: null,
        connect() {},
        disconnect() {},
        stop() {
          this.stopped++
        },
        start() {},
      }
      sources.push(source)
      return source
    },
  }
  return { context: context as unknown as AudioContext, sources, rates }
}

test('PCM decode uses signed little-endian 16-bit mono data and rejects malformed output', () => {
  assert.deepEqual([...decodePcm16('AID/fw==')], [-1, 32767 / 32768])
  assert.throws(() => decodePcm16('AA=='), /PCM16/)
  assert.throws(() => decodePcm16(''), /PCM16/)
})

test('playback honors the declared sample rate, clears current/queued audio and discards interrupted chunks', () => {
  const { context, sources, rates } = fakeContext()
  const updates: boolean[] = []
  const player = new PcmPlayer(context, (active) => updates.push(active))
  try {
    player.handleEvent({
      contentStart: {
        contentId: 'a',
        role: 'ASSISTANT',
        type: 'AUDIO',
        audioOutputConfiguration: { sampleRateHertz: 16000 },
      },
    })
    player.handleEvent({ audioOutput: { contentId: 'a', content: toneFixture() } })
    player.handleEvent({ audioOutput: { contentId: 'a', content: toneFixture() } })
    assert.deepEqual(rates, [16000, 16000])
    assert.equal(updates.at(-1), true)
    player.interrupt()
    assert.deepEqual(
      sources.map((source) => source.stopped),
      [1, 1],
    )
    assert.equal(updates.at(-1), false)
    player.handleEvent({ audioOutput: { contentId: 'a', content: toneFixture() } })
    assert.equal(sources.length, 2)
    player.handleEvent({
      contentStart: {
        contentId: 'b',
        role: 'ASSISTANT',
        type: 'AUDIO',
        audioOutputConfiguration: { sampleRateHertz: 24000 },
      },
    })
    player.handleEvent({ audioOutput: { contentId: 'b', content: toneFixture() } })
    assert.equal(sources.length, 3)
    sources[2].onended?.()
    assert.equal(updates.at(-1), false)
  } finally {
    player.dispose()
  }
})

test('playback fails on missing audio metadata or an excessive generated-ahead buffer', () => {
  const { context } = fakeContext()
  const player = new PcmPlayer(context, () => undefined)
  try {
    assert.throws(
      () => player.handleEvent({ audioOutput: { contentId: 'missing', content: toneFixture() } }),
      /contentStart/,
    )
    player.handleEvent({ contentStart: { contentId: 'a', role: 'ASSISTANT', type: 'AUDIO' } })
    assert.throws(
      () => player.handleEvent({ audioOutput: { contentId: 'a', content: toneFixture(11) } }),
      /ten seconds/,
    )
  } finally {
    player.dispose()
  }
})

test('AudioWorklet fixture continuously resamples 48 kHz to 16 kHz across 128-sample blocks', async () => {
  const source = await readFile(new URL('../public/pcm-capture.js', import.meta.url), 'utf8')
  const frames: Array<{ pcm: ArrayBuffer; rms: number }> = []
  let Constructor!: new () => { process(inputs: Float32Array[][]): boolean }
  vm.runInNewContext(source, {
    sampleRate: 48000,
    AudioWorkletProcessor: class {
      port = {
        postMessage(frame: { pcm: ArrayBuffer; rms: number }) {
          frames.push(frame)
        },
      }
    },
    registerProcessor(name: string, value: typeof Constructor) {
      assert.equal(name, 'nova-pcm-capture')
      Constructor = value
    },
  })
  const worklet = new Constructor()
  for (let index = 0; index < 24; index += 1) worklet.process([[new Float32Array(128).fill(0.25)]])
  assert.equal(frames.length, 2) // 3072 input samples / 3 = 1024 output samples.
  assert.equal(frames[0].pcm.byteLength, 1024)
  assert.equal(new DataView(frames[0].pcm).getInt16(0, true), 8192)
  assert.equal(frames[0].rms, 0.25)
})
