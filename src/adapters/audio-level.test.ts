import { describe, expect, it } from 'vitest'
import { calibrateOutputVolume } from './audio-level'

describe('calibrateOutputVolume', () => {
  it('applies a noise floor, gain, curve, and independent attack/release rates', () => {
    const calibration = {
      noiseFloor: 0.005,
      gain: 4,
      exponent: 0.8,
      attack: 0.5,
      release: 0.1,
    }

    expect(calibrateOutputVolume(0.004, 0, calibration)).toEqual({
      raw: 0.004,
      shaped: 0,
      normalized: 0,
    })

    const attack = calibrateOutputVolume(0.05, 0, calibration)
    expect(attack.shaped).toBeGreaterThan(0.2)
    expect(attack.normalized).toBeCloseTo(attack.shaped * 0.5)

    const release = calibrateOutputVolume(0, attack.normalized, calibration)
    expect(release.normalized).toBeCloseTo(attack.normalized * 0.9)
  })

  it('reads live calibration values from a getter', () => {
    let gain = 2
    const getCalibration = () => ({ gain })

    const quieter = calibrateOutputVolume(0.05, 0, getCalibration)
    gain = 8
    const louder = calibrateOutputVolume(0.05, 0, getCalibration)

    expect(louder.normalized).toBeGreaterThan(quieter.normalized)
  })
})
