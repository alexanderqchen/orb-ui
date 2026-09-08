export interface VolumeAmplitudeCalibration {
  /** Raw values at or below this level are treated as silence. */
  silenceFloor: number
  /** Raw value representing ordinary conversational speech. Maps to 0.5. */
  speechReference: number
  /** Raw value representing a strong, uncommon speech peak. Maps to 1. */
  speechPeak: number
}

export interface VolumeEnvelopeCalibration {
  /** Milliseconds to move 90% toward a rising target. */
  riseTimeMs: number
  /** Milliseconds to move 90% toward a falling target. */
  fallTimeMs: number
}

export interface VolumeCalibration {
  amplitude: VolumeAmplitudeCalibration
  envelope: VolumeEnvelopeCalibration
}

export interface VolumeCalibrationOverrides {
  amplitude?: Partial<VolumeAmplitudeCalibration>
  envelope?: Partial<VolumeEnvelopeCalibration>
}

export type VolumeCalibrationSource =
  | VolumeCalibrationOverrides
  | (() => VolumeCalibrationOverrides)

export interface VolumeSample {
  /** Unmodified value measured from the provider audio source. */
  raw: number
  /** Value after silence, reference, and peak mapping. */
  mapped: number
  /** Stable envelope after elapsed-time rise/fall processing. */
  normalized: number
  /** Elapsed time used for this envelope update. */
  elapsedMs: number
}

export interface VolumeCalibrationCapture {
  silence: number[]
  quiet: number[]
  normal: number[]
  energetic: number[]
}

export interface VolumeCalibrationMetrics {
  silenceP99: number
  quietMedian: number
  normalMedian: number
  energeticMedian: number
  speechP99: number
  saturationRatio: number
}

export interface VolumeCalibrationFit {
  calibration: VolumeCalibration
  metrics: VolumeCalibrationMetrics
}

export interface VolumeNormalizer {
  sample(rawValue: number, timestampMs?: number): VolumeSample
  reset(value?: number): void
}

export interface MediaStreamTrackVolumeMeter {
  stop(): Promise<void>
}

export type AudioContextSource = () => AudioContext | undefined

const MIN_AMPLITUDE_GAP = 0.000_001
const DEFAULT_SAMPLE_INTERVAL_MS = 1000 / 30

export const DEFAULT_VOLUME_CALIBRATION: VolumeCalibration = {
  amplitude: {
    silenceFloor: 0,
    speechReference: 0.5,
    speechPeak: 1,
  },
  envelope: {
    riseTimeMs: 100,
    fallTimeMs: 400,
  },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function resolveAmplitudeCalibration(
  defaults: VolumeAmplitudeCalibration,
  overrides?: Partial<VolumeAmplitudeCalibration>,
): VolumeAmplitudeCalibration {
  const silenceFloor = clamp(
    finiteOr(overrides?.silenceFloor, defaults.silenceFloor),
    0,
    1 - MIN_AMPLITUDE_GAP * 2,
  )
  const speechReference = clamp(
    finiteOr(overrides?.speechReference, defaults.speechReference),
    silenceFloor + MIN_AMPLITUDE_GAP,
    1 - MIN_AMPLITUDE_GAP,
  )
  const speechPeak = clamp(
    finiteOr(overrides?.speechPeak, defaults.speechPeak),
    speechReference + MIN_AMPLITUDE_GAP,
    1,
  )

  return { silenceFloor, speechReference, speechPeak }
}

function resolveCalibration(
  defaults: VolumeCalibration,
  source: VolumeCalibrationSource | undefined,
): VolumeCalibration {
  const overrides = typeof source === 'function' ? source() : source

  return {
    amplitude: resolveAmplitudeCalibration(defaults.amplitude, overrides?.amplitude),
    envelope: {
      riseTimeMs: Math.max(
        0,
        finiteOr(overrides?.envelope?.riseTimeMs, defaults.envelope.riseTimeMs),
      ),
      fallTimeMs: Math.max(
        0,
        finiteOr(overrides?.envelope?.fallTimeMs, defaults.envelope.fallTimeMs),
      ),
    },
  }
}

export function mapVolumeAmplitude(rawValue: number, calibration: VolumeAmplitudeCalibration) {
  const resolved = resolveAmplitudeCalibration(DEFAULT_VOLUME_CALIBRATION.amplitude, calibration)
  const raw = Number.isFinite(rawValue) ? clamp(rawValue, 0, 1) : 0
  if (raw <= resolved.silenceFloor) return 0
  if (raw >= resolved.speechPeak) return 1

  const range = resolved.speechPeak - resolved.silenceFloor
  const scaled = clamp((raw - resolved.silenceFloor) / range, 0, 1)
  const referencePosition = clamp(
    (resolved.speechReference - resolved.silenceFloor) / range,
    MIN_AMPLITUDE_GAP,
    1 - MIN_AMPLITUDE_GAP,
  )
  const exponent = Math.log(0.5) / Math.log(referencePosition)
  return clamp(Math.pow(scaled, exponent), 0, 1)
}

function followEnvelope(current: number, target: number, durationMs: number, elapsedMs: number) {
  if (durationMs <= 0) return target
  const rate = 1 - Math.pow(0.1, Math.max(0, elapsedMs) / durationMs)
  return clamp(current + (target - current) * rate, 0, 1)
}

export function calibrateVolume(
  rawValue: number,
  previous: number,
  elapsedMs: number,
  defaults: VolumeCalibration = DEFAULT_VOLUME_CALIBRATION,
  source?: VolumeCalibrationSource,
): VolumeSample {
  const calibration = resolveCalibration(defaults, source)
  const raw = Number.isFinite(rawValue) ? clamp(rawValue, 0, 1) : 0
  const mapped = mapVolumeAmplitude(raw, calibration.amplitude)
  const durationMs =
    mapped > previous ? calibration.envelope.riseTimeMs : calibration.envelope.fallTimeMs
  const normalized = followEnvelope(previous, mapped, durationMs, elapsedMs)

  return { raw, mapped, normalized, elapsedMs }
}

export function createVolumeNormalizer(
  defaults: VolumeCalibration = DEFAULT_VOLUME_CALIBRATION,
  source?: VolumeCalibrationSource,
): VolumeNormalizer {
  let current = 0
  let lastTimestamp: number | undefined

  return {
    sample(rawValue, timestampMs = performance.now()) {
      const elapsedMs =
        lastTimestamp === undefined
          ? DEFAULT_SAMPLE_INTERVAL_MS
          : clamp(timestampMs - lastTimestamp, 0, 1000)
      lastTimestamp = timestampMs
      const sample = calibrateVolume(rawValue, current, elapsedMs, defaults, source)
      current = sample.normalized
      return sample
    },
    reset(value = 0) {
      current = clamp(value, 0, 1)
      lastTimestamp = undefined
    },
  }
}

function percentile(values: number[], position: number) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .map((value) => clamp(value, 0, 1))
    .sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const index = clamp(position, 0, 1) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const mix = index - lower
  return sorted[lower] + (sorted[upper] - sorted[lower]) * mix
}

function mappedPercentile(
  values: number[],
  position: number,
  calibration: VolumeAmplitudeCalibration,
) {
  return percentile(
    values.map((value) => mapVolumeAmplitude(value, calibration)),
    position,
  )
}

export function fitVolumeCalibration(
  capture: VolumeCalibrationCapture,
  envelope: VolumeEnvelopeCalibration = DEFAULT_VOLUME_CALIBRATION.envelope,
): VolumeCalibrationFit {
  for (const phase of ['silence', 'quiet', 'normal', 'energetic'] as const) {
    if (!capture[phase].some((value) => Number.isFinite(value))) {
      throw new Error(`Volume calibration requires at least one ${phase} sample.`)
    }
  }

  const silenceP99Raw = percentile(capture.silence, 0.99)
  const normalMedianRaw = percentile(capture.normal, 0.5)
  const energeticPeakRaw = Math.max(
    percentile(capture.energetic, 0.99),
    percentile(capture.normal, 0.99),
  )
  const availableRange = Math.max(0, normalMedianRaw - silenceP99Raw)
  const amplitude = resolveAmplitudeCalibration(DEFAULT_VOLUME_CALIBRATION.amplitude, {
    silenceFloor: silenceP99Raw + Math.min(0.005, availableRange * 0.05),
    speechReference: normalMedianRaw,
    speechPeak: energeticPeakRaw,
  })
  const calibration: VolumeCalibration = {
    amplitude,
    envelope: {
      riseTimeMs: Math.max(0, finiteOr(envelope.riseTimeMs, 100)),
      fallTimeMs: Math.max(0, finiteOr(envelope.fallTimeMs, 400)),
    },
  }
  const allSpeech = [...capture.quiet, ...capture.normal, ...capture.energetic]
  const mappedSpeech = allSpeech.map((value) => mapVolumeAmplitude(value, calibration.amplitude))

  return {
    calibration,
    metrics: {
      silenceP99: mappedPercentile(capture.silence, 0.99, calibration.amplitude),
      quietMedian: mappedPercentile(capture.quiet, 0.5, calibration.amplitude),
      normalMedian: mappedPercentile(capture.normal, 0.5, calibration.amplitude),
      energeticMedian: mappedPercentile(capture.energetic, 0.5, calibration.amplitude),
      speechP99: percentile(mappedSpeech, 0.99),
      saturationRatio:
        mappedSpeech.length === 0
          ? 0
          : mappedSpeech.filter((value) => value >= 0.999).length / mappedSpeech.length,
    },
  }
}

export function createMediaStreamTrackVolumeMeter(
  track: MediaStreamTrack,
  createAudioContext: AudioContextSource,
  onVolume: (volume: number) => void,
): MediaStreamTrackVolumeMeter | undefined {
  let context: AudioContext | undefined

  try {
    context = createAudioContext()
    if (!context) return undefined
    const activeContext = context
    if (activeContext.state === 'suspended') void activeContext.resume().catch(() => undefined)

    const source = activeContext.createMediaStreamSource(new MediaStream([track]))
    const analyser = activeContext.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.25
    source.connect(analyser)

    const samples = new Float32Array(analyser.fftSize)
    const interval = setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      let sumSquares = 0
      for (const sample of samples) sumSquares += sample * sample
      onVolume(Math.sqrt(sumSquares / samples.length))
    }, 33)

    return {
      async stop() {
        clearInterval(interval)
        try {
          source.disconnect()
          analyser.disconnect()
        } finally {
          if (activeContext.state !== 'closed') await activeContext.close()
        }
      },
    }
  } catch {
    if (context?.state !== 'closed') void context?.close().catch(() => undefined)
    return undefined
  }
}
