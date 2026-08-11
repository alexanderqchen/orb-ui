import type { OrbState } from '../components/Orb/Orb.types'

export type OrbThemeName = 'debug' | 'circle' | 'bars' | 'cloud' | 'radial'
export type OrbThemePreset = 'balanced' | 'calm' | 'expressive'
export type OrbStateColors = Record<OrbState, string>

interface ThemeConfig<Name extends OrbThemeName, Appearance, Geometry, Motion> {
  name: Name
  /** Starts from a complete preset before low-level overrides are applied. */
  preset?: OrbThemePreset
  appearance?: Partial<Appearance>
  geometry?: Partial<Geometry>
  motion?: Partial<Motion>
}

export interface CircleAppearance {
  colors: Partial<OrbStateColors>
  listeningGlow: number
  speakingGlow: number
}

export interface CircleGeometry {
  diameterRatio: number
  listeningMinScale: number
  listeningMaxScale: number
  speakingMinScale: number
  speakingMaxScale: number
}

export interface CircleMotion {
  responseExponent: number
  activityRiseMs: number
  activityFallMs: number
  stateTransitionMs: number
  idlePulseMs: number
  processingPulseMs: number
}

export type CircleThemeConfig = ThemeConfig<
  'circle',
  CircleAppearance,
  CircleGeometry,
  CircleMotion
>

export interface BarsAppearance {
  colors: Partial<OrbStateColors>
}

export interface BarsGeometry {
  barWidthRatio: number
  gapRatio: number
  minHeightRatio: number
  maxHeightRatio: number
  borderRadiusRatio: number
}

export interface BarsMotion {
  responseExponent: number
  activityRiseMs: number
  activityFallMs: number
  stateTransitionMs: number
  waveFrequency: number
  listeningTempo: number
  speakingTempo: number
  loadingTempo: number
}

export type BarsThemeConfig = ThemeConfig<'bars', BarsAppearance, BarsGeometry, BarsMotion>

export interface CloudAppearance {
  deepColor: string
  upperColor: string
  lowerColor: string
  highlightColor: string
  launchColor: string
  spinnerColor: string
}

export interface CloudGeometry {
  diameterRatio: number
  listeningMinScale: number
  speakingMaxScale: number
  idleDotScale: number
}

export interface CloudMotion {
  responseExponent: number
  activityRiseMs: number
  activityFallMs: number
  stateTransitionMs: number
  idleSpeed: number
  listeningBaseSpeed: number
  listeningSpeedRange: number
  speakingBaseSpeed: number
  speakingSpeedRange: number
  entranceHoldMs: number
  entranceGrowMs: number
  entranceSettleMs: number
}

export type CloudThemeConfig = ThemeConfig<'cloud', CloudAppearance, CloudGeometry, CloudMotion>

export interface RadialAppearance {
  deepColor: string
  cobaltColor: string
  aquaColor: string
  paleColor: string
  membraneColor: string
  seamColor: string
  idleControlColor: string
  activeControlColor: string
  connectingControlColor: string
}

export interface RadialGeometry {
  diameterRatio: number
  controlRatio: number
}

export interface RadialMotion {
  responseExponent: number
  activityRiseMs: number
  activityFallMs: number
  stateTransitionMs: number
  idleSpeed: number
  listeningBaseSpeed: number
  listeningSpeedRange: number
  speakingBaseSpeed: number
  speakingSpeedRange: number
  rotationAmount: number
}

export type RadialThemeConfig = ThemeConfig<
  'radial',
  RadialAppearance,
  RadialGeometry,
  RadialMotion
>

export interface DebugAppearance {
  colors: Partial<OrbStateColors>
  backgroundColor: string
  textColor: string
  borderColor: string
}

export interface DebugGeometry {
  borderRadius: number
  padding: number
}

export interface DebugMotion {
  responseExponent: number
}

export type DebugThemeConfig = ThemeConfig<'debug', DebugAppearance, DebugGeometry, DebugMotion>

export type OrbThemeConfig =
  | DebugThemeConfig
  | CircleThemeConfig
  | BarsThemeConfig
  | CloudThemeConfig
  | RadialThemeConfig

export type OrbTheme = OrbThemeName | OrbThemeConfig

/** Preserve literal theme inference when defining a reusable application theme. */
export function defineOrbTheme<const Theme extends OrbThemeConfig>(theme: Theme): Theme {
  return theme
}

export function mergeOrbThemes(
  base: OrbTheme | undefined,
  override: OrbTheme | undefined,
): OrbTheme {
  if (!base) return override ?? 'debug'
  if (!override) return base
  if (typeof override === 'string') return override
  if (typeof base === 'string' || base.name !== override.name) return override

  const baseAppearance = base.appearance as Record<string, unknown> | undefined
  const overrideAppearance = override.appearance as Record<string, unknown> | undefined
  const baseColors = baseAppearance?.colors as Record<string, unknown> | undefined
  const overrideColors = overrideAppearance?.colors as Record<string, unknown> | undefined

  return {
    ...base,
    ...override,
    preset: override.preset ?? base.preset,
    appearance: {
      ...base.appearance,
      ...override.appearance,
      ...(baseColors || overrideColors
        ? { colors: { ...baseColors, ...overrideColors } }
        : undefined),
    },
    geometry: { ...base.geometry, ...override.geometry },
    motion: { ...base.motion, ...override.motion },
  } as OrbThemeConfig
}

interface ResolvedTheme<Name extends OrbThemeName, Appearance, Geometry, Motion> {
  name: Name
  preset: OrbThemePreset
  appearance: Appearance
  geometry: Geometry
  motion: Motion
}

export type ResolvedCircleTheme = ResolvedTheme<
  'circle',
  Omit<CircleAppearance, 'colors'> & { colors: OrbStateColors },
  CircleGeometry,
  CircleMotion
>
export type ResolvedBarsTheme = ResolvedTheme<
  'bars',
  { colors: OrbStateColors },
  BarsGeometry,
  BarsMotion
>
export type ResolvedCloudTheme = ResolvedTheme<'cloud', CloudAppearance, CloudGeometry, CloudMotion>
export type ResolvedRadialTheme = ResolvedTheme<
  'radial',
  RadialAppearance,
  RadialGeometry,
  RadialMotion
>
export type ResolvedDebugTheme = ResolvedTheme<
  'debug',
  Omit<DebugAppearance, 'colors'> & { colors: OrbStateColors },
  DebugGeometry,
  DebugMotion
>
export type ResolvedOrbTheme =
  | ResolvedDebugTheme
  | ResolvedCircleTheme
  | ResolvedBarsTheme
  | ResolvedCloudTheme
  | ResolvedRadialTheme

const NEUTRAL_COLORS: OrbStateColors = {
  idle: '#cccccc',
  connecting: '#cccccc',
  listening: '#999999',
  thinking: '#d8d8d8',
  speaking: '#e8e8e8',
  error: '#f87171',
}

const CIRCLE_BALANCED: ResolvedCircleTheme = {
  name: 'circle',
  preset: 'balanced',
  appearance: { colors: NEUTRAL_COLORS, listeningGlow: 0, speakingGlow: 24 },
  geometry: {
    diameterRatio: 0.55,
    listeningMinScale: 0.82,
    listeningMaxScale: 1,
    speakingMinScale: 0.95,
    speakingMaxScale: 1.03,
  },
  motion: {
    responseExponent: 1,
    activityRiseMs: 50,
    activityFallMs: 110,
    stateTransitionMs: 620,
    idlePulseMs: 3000,
    processingPulseMs: 1500,
  },
}

const BARS_BALANCED: ResolvedBarsTheme = {
  name: 'bars',
  preset: 'balanced',
  appearance: { colors: NEUTRAL_COLORS },
  geometry: {
    barWidthRatio: 0.055,
    gapRatio: 0.035,
    minHeightRatio: 0.06,
    maxHeightRatio: 0.55,
    borderRadiusRatio: 0.03,
  },
  motion: {
    responseExponent: 1,
    activityRiseMs: 60,
    activityFallMs: 100,
    stateTransitionMs: 300,
    waveFrequency: 1.4,
    listeningTempo: 0.4,
    speakingTempo: 1,
    loadingTempo: 0.6,
  },
}

const CLOUD_BALANCED: ResolvedCloudTheme = {
  name: 'cloud',
  preset: 'balanced',
  appearance: {
    deepColor: '#5c63fb',
    upperColor: '#7a8ffb',
    lowerColor: '#b8c7f9',
    highlightColor: '#e3eafa',
    launchColor: '#5659dc',
    spinnerColor: '#777ff6',
  },
  geometry: {
    diameterRatio: 0.55,
    listeningMinScale: 0.796,
    speakingMaxScale: 1.2145,
    idleDotScale: 0.063,
  },
  motion: {
    responseExponent: 1,
    activityRiseMs: 210,
    activityFallMs: 380,
    stateTransitionMs: 250,
    idleSpeed: 0.24,
    listeningBaseSpeed: 0.72,
    listeningSpeedRange: 0.78,
    speakingBaseSpeed: 1.65,
    speakingSpeedRange: 1.55,
    entranceHoldMs: 180,
    entranceGrowMs: 300,
    entranceSettleMs: 1350,
  },
}

const RADIAL_BALANCED: ResolvedRadialTheme = {
  name: 'radial',
  preset: 'balanced',
  appearance: {
    deepColor: '#011b5e',
    cobaltColor: '#0457c2',
    aquaColor: '#3dc2c9',
    paleColor: '#c4f5f2',
    membraneColor: '#78d6d6',
    seamColor: '#fbfefe',
    idleControlColor: '#080808',
    activeControlColor: '#ef4146',
    connectingControlColor: '#9da1aa',
  },
  geometry: { diameterRatio: 0.66, controlRatio: 0.2 },
  motion: {
    responseExponent: 1,
    activityRiseMs: 160,
    activityFallMs: 380,
    stateTransitionMs: 650,
    idleSpeed: 0.36,
    listeningBaseSpeed: 0.54,
    listeningSpeedRange: 0.26,
    speakingBaseSpeed: 1.05,
    speakingSpeedRange: 1.15,
    rotationAmount: 1,
  },
}

const DEBUG_COLORS: OrbStateColors = {
  idle: '#888888',
  connecting: '#f0c040',
  listening: '#40c0f0',
  thinking: '#c084fc',
  speaking: '#40f080',
  error: '#f04040',
}

const DEBUG_BALANCED: ResolvedDebugTheme = {
  name: 'debug',
  preset: 'balanced',
  appearance: {
    colors: DEBUG_COLORS,
    backgroundColor: '#111111',
    textColor: '#cccccc',
    borderColor: '#333333',
  },
  geometry: { borderRadius: 8, padding: 12 },
  motion: { responseExponent: 1 },
}

function withPreset<T extends ResolvedOrbTheme>(
  balanced: T,
  preset: OrbThemePreset,
  calm: { geometry?: Partial<T['geometry']>; motion?: Partial<T['motion']> },
  expressive: { geometry?: Partial<T['geometry']>; motion?: Partial<T['motion']> },
): T {
  const changes = preset === 'calm' ? calm : preset === 'expressive' ? expressive : {}
  return {
    ...balanced,
    preset,
    geometry: { ...balanced.geometry, ...changes.geometry },
    motion: { ...balanced.motion, ...changes.motion },
  }
}

function resolveCircle(preset: OrbThemePreset): ResolvedCircleTheme {
  return withPreset(
    CIRCLE_BALANCED,
    preset,
    {
      geometry: {
        listeningMinScale: 0.9,
        listeningMaxScale: 0.99,
        speakingMinScale: 0.97,
        speakingMaxScale: 1.01,
      },
      motion: {
        responseExponent: 1.2,
        activityRiseMs: 140,
        activityFallMs: 300,
        stateTransitionMs: 900,
      },
    },
    {
      geometry: {
        listeningMinScale: 0.74,
        listeningMaxScale: 1.02,
        speakingMinScale: 0.91,
        speakingMaxScale: 1.09,
      },
      motion: {
        responseExponent: 0.78,
        activityRiseMs: 20,
        activityFallMs: 80,
        stateTransitionMs: 250,
      },
    },
  )
}

function resolveBars(preset: OrbThemePreset): ResolvedBarsTheme {
  return withPreset(
    BARS_BALANCED,
    preset,
    {
      geometry: {
        maxHeightRatio: 0.4,
      },
      motion: {
        responseExponent: 1.2,
        activityRiseMs: 140,
        activityFallMs: 260,
        stateTransitionMs: 500,
        waveFrequency: 0.9,
      },
    },
    {
      geometry: {
        maxHeightRatio: 0.68,
      },
      motion: {
        responseExponent: 0.78,
        activityRiseMs: 20,
        activityFallMs: 60,
        stateTransitionMs: 160,
        waveFrequency: 2,
      },
    },
  )
}

function resolveCloud(preset: OrbThemePreset): ResolvedCloudTheme {
  return withPreset(
    CLOUD_BALANCED,
    preset,
    {
      geometry: {
        listeningMinScale: 0.9,
        speakingMaxScale: 1.1,
      },
      motion: {
        responseExponent: 1.2,
        activityRiseMs: 350,
        activityFallMs: 600,
        stateTransitionMs: 450,
        listeningSpeedRange: 0.35,
        speakingBaseSpeed: 1.1,
        speakingSpeedRange: 0.7,
      },
    },
    {
      geometry: {
        listeningMinScale: 0.7,
        speakingMaxScale: 1.32,
      },
      motion: {
        responseExponent: 0.76,
        activityRiseMs: 70,
        activityFallMs: 160,
        stateTransitionMs: 130,
        listeningSpeedRange: 1.1,
        speakingBaseSpeed: 2,
        speakingSpeedRange: 2,
      },
    },
  )
}

function resolveRadial(preset: OrbThemePreset): ResolvedRadialTheme {
  return withPreset(
    RADIAL_BALANCED,
    preset,
    {
      motion: {
        responseExponent: 1.2,
        activityRiseMs: 320,
        activityFallMs: 650,
        stateTransitionMs: 950,
        listeningSpeedRange: 0.12,
        speakingBaseSpeed: 0.75,
        speakingSpeedRange: 0.55,
        rotationAmount: 0.65,
      },
    },
    {
      motion: {
        responseExponent: 0.78,
        activityRiseMs: 60,
        activityFallMs: 150,
        stateTransitionMs: 260,
        listeningSpeedRange: 0.45,
        speakingBaseSpeed: 1.35,
        speakingSpeedRange: 1.65,
        rotationAmount: 1.35,
      },
    },
  )
}

function resolveDebug(preset: OrbThemePreset): ResolvedDebugTheme {
  return {
    ...DEBUG_BALANCED,
    preset,
    motion: {
      responseExponent: preset === 'calm' ? 1.2 : preset === 'expressive' ? 0.78 : 1,
    },
  }
}

function mergeColors(colors: OrbStateColors, overrides?: Partial<OrbStateColors>): OrbStateColors {
  return { ...colors, ...overrides }
}

function sanitizeMotion<Motion extends { responseExponent: number }>(
  motion: Motion,
  fallback: Motion,
): Motion {
  const sanitized = { ...motion } as Record<string, unknown>
  const fallbackValues = fallback as Record<string, unknown>

  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value !== 'number') continue

    const invalidExponent = key === 'responseExponent' && value <= 0
    const invalidDuration = key.endsWith('Ms') && value < 0
    if (!Number.isFinite(value) || invalidExponent || invalidDuration) {
      sanitized[key] = fallbackValues[key]
    }
  }

  return sanitized as Motion
}

export function resolveOrbTheme(theme: OrbTheme): ResolvedOrbTheme {
  const config: OrbThemeConfig = typeof theme === 'string' ? { name: theme } : theme
  const preset = config.preset ?? 'balanced'

  switch (config.name) {
    case 'circle': {
      const base = resolveCircle(preset)
      return {
        ...base,
        appearance: {
          ...base.appearance,
          ...config.appearance,
          colors: mergeColors(base.appearance.colors, config.appearance?.colors),
        },
        geometry: { ...base.geometry, ...config.geometry },
        motion: sanitizeMotion({ ...base.motion, ...config.motion }, base.motion),
      }
    }
    case 'bars': {
      const base = resolveBars(preset)
      return {
        ...base,
        appearance: {
          ...base.appearance,
          ...config.appearance,
          colors: mergeColors(base.appearance.colors, config.appearance?.colors),
        },
        geometry: { ...base.geometry, ...config.geometry },
        motion: sanitizeMotion({ ...base.motion, ...config.motion }, base.motion),
      }
    }
    case 'cloud': {
      const base = resolveCloud(preset)
      return {
        ...base,
        appearance: { ...base.appearance, ...config.appearance },
        geometry: { ...base.geometry, ...config.geometry },
        motion: sanitizeMotion({ ...base.motion, ...config.motion }, base.motion),
      }
    }
    case 'radial': {
      const base = resolveRadial(preset)
      return {
        ...base,
        appearance: { ...base.appearance, ...config.appearance },
        geometry: { ...base.geometry, ...config.geometry },
        motion: sanitizeMotion({ ...base.motion, ...config.motion }, base.motion),
      }
    }
    case 'debug':
    default: {
      const base = resolveDebug(preset)
      return {
        ...base,
        appearance: {
          ...base.appearance,
          ...config.appearance,
          colors: mergeColors(base.appearance.colors, config.appearance?.colors),
        },
        geometry: { ...base.geometry, ...config.geometry },
        motion: sanitizeMotion({ ...base.motion, ...config.motion }, base.motion),
      }
    }
  }
}
