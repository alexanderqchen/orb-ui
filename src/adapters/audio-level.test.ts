import { describe, expect, it } from 'vitest'
import {
  calibrateVolume,
  createVolumeNormalizer,
  fitVolumeCalibration,
  mapVolumeAmplitude,
  type VolumeCalibration,
} from './audio-level'

const CALIBRATION: VolumeCalibration = {
  amplitude: {
    silenceFloor: 0.01,
    speechReference: 0.21,
    speechPeak: 0.81,
  },
  envelope: {
    riseTimeMs: 100,
    fallTimeMs: 250,
  },
}

describe('volume calibration', () => {
  it('maps silence, ordinary speech, and strong peaks to semantic anchors', () => {
    expect(mapVolumeAmplitude(0.005, CALIBRATION.amplitude)).toBe(0)
    expect(mapVolumeAmplitude(0.21, CALIBRATION.amplitude)).toBeCloseTo(0.5)
    expect(mapVolumeAmplitude(0.81, CALIBRATION.amplitude)).toBe(1)
  })

  it('uses elapsed-time rise and fall durations independent of sample rate', () => {
    const oneRise = calibrateVolume(0.81, 0, 100, CALIBRATION)
    const halfRise = calibrateVolume(0.81, 0, 50, CALIBRATION)
    const twoHalfRises = calibrateVolume(0.81, halfRise.normalized, 50, CALIBRATION)
    expect(oneRise.normalized).toBeCloseTo(0.9)
    expect(twoHalfRises.normalized).toBeCloseTo(oneRise.normalized)

    const release = calibrateVolume(0, 1, 250, CALIBRATION)
    expect(release.normalized).toBeCloseTo(0.1)
  })

  it('reads live overrides from a getter', () => {
    let speechPeak = 0.8
    const normalizer = createVolumeNormalizer(CALIBRATION, () => ({
      amplitude: { speechPeak },
      envelope: { riseTimeMs: 0, fallTimeMs: 0 },
    }))

    const quieter = normalizer.sample(0.4, 0)
    normalizer.reset()
    speechPeak = 0.4
    const louder = normalizer.sample(0.4, 0)

    expect(louder.normalized).toBeGreaterThan(quieter.normalized)
  })

  it('generates calibration anchors and distribution diagnostics from guided samples', () => {
    const fit = fitVolumeCalibration({
      silence: [0.001, 0.002, 0.003],
      quiet: [0.05, 0.06, 0.07],
      normal: [0.18, 0.2, 0.22],
      energetic: [0.5, 0.7, 0.9],
    })

    expect(fit.calibration.amplitude.silenceFloor).toBeGreaterThan(0.002)
    expect(fit.metrics.silenceP99).toBe(0)
    expect(fit.metrics.normalMedian).toBeCloseTo(0.5)
    expect(fit.metrics.speechP99).toBeGreaterThan(0.9)
    expect(fit.calibration.envelope).toEqual({ riseTimeMs: 100, fallTimeMs: 250 })
  })

  it('rejects incomplete guided captures instead of inventing missing anchors', () => {
    expect(() =>
      fitVolumeCalibration({
        silence: [0.001],
        quiet: [],
        normal: [0.2],
        energetic: [0.8],
      }),
    ).toThrow('at least one quiet sample')
  })
})
