export interface OutputVolumeCalibration {
  /** Raw RMS values at or below this level are treated as silence. */
  noiseFloor: number
  /** Multiplier applied after the noise floor. */
  gain: number
  /** Power curve applied after gain. Values below 1 lift quieter speech. */
  exponent: number
  /** EMA rate used while the volume is rising. */
  attack: number
  /** EMA rate used while the volume is falling. */
  release: number
}

export type OutputVolumeCalibrationSource =
  | Partial<OutputVolumeCalibration>
  | (() => Partial<OutputVolumeCalibration>)

export interface OutputVolumeSample {
  /** Unmodified RMS value measured from the provider audio stream. */
  raw: number
  /** Value after noise floor, gain, and power-curve shaping. */
  shaped: number
  /** Final value after attack/release smoothing. */
  normalized: number
}

export const DEFAULT_OUTPUT_VOLUME_CALIBRATION: OutputVolumeCalibration = {
  noiseFloor: 0,
  gain: 4,
  exponent: 0.8,
  attack: 1,
  release: 1,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function resolveCalibration(
  source: OutputVolumeCalibrationSource | undefined,
): OutputVolumeCalibration {
  const overrides = typeof source === 'function' ? source() : source

  return {
    noiseFloor: clamp(
      finiteOr(overrides?.noiseFloor, DEFAULT_OUTPUT_VOLUME_CALIBRATION.noiseFloor),
      0,
      1,
    ),
    gain: Math.max(0, finiteOr(overrides?.gain, DEFAULT_OUTPUT_VOLUME_CALIBRATION.gain)),
    exponent: Math.max(
      0.01,
      finiteOr(overrides?.exponent, DEFAULT_OUTPUT_VOLUME_CALIBRATION.exponent),
    ),
    attack: clamp(finiteOr(overrides?.attack, DEFAULT_OUTPUT_VOLUME_CALIBRATION.attack), 0, 1),
    release: clamp(finiteOr(overrides?.release, DEFAULT_OUTPUT_VOLUME_CALIBRATION.release), 0, 1),
  }
}

export function calibrateOutputVolume(
  rawValue: number,
  previous: number,
  source?: OutputVolumeCalibrationSource,
): OutputVolumeSample {
  const raw = Number.isFinite(rawValue) ? clamp(rawValue, 0, 1) : 0
  const calibration = resolveCalibration(source)
  const gated = raw <= calibration.noiseFloor ? 0 : raw - calibration.noiseFloor
  const shaped = Math.pow(clamp(gated * calibration.gain, 0, 1), calibration.exponent)
  const rate = shaped > previous ? calibration.attack : calibration.release
  const normalized = clamp(previous + (shaped - previous) * rate, 0, 1)

  return { raw, shaped, normalized }
}
