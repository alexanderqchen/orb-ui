import type { VolumeCalibration } from './audio-level'

export interface DirectionalVolumeCalibration {
  input?: VolumeCalibration
  output?: VolumeCalibration
}

const CANONICAL_ENVELOPE = {
  riseTimeMs: 100,
  fallTimeMs: 250,
} as const

function calibration(
  silenceFloor: number,
  speechReference: number,
  speechPeak: number,
): VolumeCalibration {
  return {
    amplitude: { silenceFloor, speechReference, speechPeak },
    envelope: { ...CANONICAL_ENVELOPE },
  }
}

/**
 * Shipped provider baselines. The playground calibration runner generates
 * replacements from guided raw-level captures without requiring manual sliders.
 */
export const PROVIDER_VOLUME_CALIBRATIONS = {
  vapi: {
    output: calibration(0.12, 0.667, 1),
  },
  elevenlabs: {
    input: calibration(0, 0.25, 0.5),
    output: calibration(0, 0.25, 0.5),
  },
  livekit: {
    input: calibration(0, 0.293_365, 0.5),
    output: calibration(0.015, 0.133_981, 0.232_391),
  },
  pipecat: {
    input: calibration(0.002, 0.107_112, 0.252),
    output: calibration(0.002, 0.084_441, 0.198_078),
  },
  openai: {
    input: calibration(0, 0.105_112, 0.25),
    output: calibration(0.003, 0.108_112, 0.253),
  },
  gemini: {
    input: calibration(0, 0.105_112, 0.25),
    output: calibration(0.003, 0.108_112, 0.253),
  },
} as const satisfies Record<string, DirectionalVolumeCalibration>
