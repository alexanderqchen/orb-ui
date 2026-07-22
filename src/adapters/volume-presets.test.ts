import { describe, expect, it } from 'vitest'
import { mapVolumeAmplitude } from './audio-level'
import { PROVIDER_VOLUME_CALIBRATIONS } from './volume-presets'

describe('provider volume calibrations', () => {
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
        expect(profile.envelope).toEqual({ riseTimeMs: 100, fallTimeMs: 250 })
      }
    }
  })
})
