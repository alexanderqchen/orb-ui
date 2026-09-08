import { describe, expect, it } from 'vitest'
import { createVolumeNormalizer, mapVolumeAmplitude } from './audio-level'
import { PROVIDER_VOLUME_CALIBRATIONS } from './volume-presets'

describe('provider volume calibrations', () => {
  it.each([
    ['input', 0.35],
    ['output', 0.39],
  ] as const)(
    'keeps ordinary ElevenLabs %s activity in the middle of the range',
    (direction, raw) => {
      // Rounded voiced medians measured with client 1.9.0 in real WebRTC sessions.
      // Frequency-based SDK levels are substantially higher than waveform RMS.
      const normalizer = createVolumeNormalizer(PROVIDER_VOLUME_CALIBRATIONS.elevenlabs[direction])
      let normalized = 0
      for (let time = 0; time <= 1000; time += 33) {
        normalized = normalizer.sample(raw, time).normalized
      }
      expect(normalized).toBeGreaterThan(0.35)
      expect(normalized).toBeLessThan(0.65)
    },
  )

  it('uses the shared speech anchors and envelope semantics in every direction', () => {
    for (const directions of Object.values(PROVIDER_VOLUME_CALIBRATIONS)) {
      for (const profile of Object.values(directions)) {
        expect(profile.amplitude.silenceFloor).toBeLessThan(profile.amplitude.speechReference)
        expect(profile.amplitude.speechReference).toBeLessThan(profile.amplitude.speechPeak)
        expect(mapVolumeAmplitude(profile.amplitude.silenceFloor, profile.amplitude)).toBe(0)
        expect(
          mapVolumeAmplitude(profile.amplitude.speechReference, profile.amplitude),
        ).toBeCloseTo(0.5)
        expect(mapVolumeAmplitude(profile.amplitude.speechPeak, profile.amplitude)).toBe(1)
        expect(profile.envelope).toEqual({ riseTimeMs: 100, fallTimeMs: 400 })
      }
    }
  })
})
