import type { AriaAttributes, CSSProperties } from 'react'

export type OrbState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

export type OrbTheme = 'debug' | 'circle' | 'bars'

export interface OrbSignal {
  state: OrbState
  volume?: number
  inputVolume?: number
  outputVolume?: number
  error?: unknown
}

export type OrbSignalListener = (signal: OrbSignal) => void

export interface OrbAdapter {
  /**
   * Subscribe to normalized signal changes from a voice provider.
   * Returns an unsubscribe function to clean up listeners.
   */
  subscribe(listener: OrbSignalListener): () => void

  /** Start the voice session. Called internally by Orb on click. */
  start?: () => void | Promise<void>

  /** Stop the voice session. Called internally by Orb on click. */
  stop?: () => void | Promise<void>
}

/** @deprecated Use signal-based OrbAdapter.subscribe(listener). */
export interface AdapterCallbacks {
  onStateChange: (state: OrbState) => void
  onVolumeChange: (volume: number) => void
}

/** @deprecated Callback-object adapters will be removed in 0.5.0. */
export interface LegacyOrbAdapter {
  subscribe(callbacks: AdapterCallbacks): () => void
  start?: () => void | Promise<void>
  stop?: () => void | Promise<void>
}

type DataAttributeValue = string | number | boolean | null | undefined

export interface OrbHtmlAttributes extends AriaAttributes {
  /** Forwarded to the rendered orb control/container. */
  id?: string
  /** Forwarded to the rendered orb control/container. */
  title?: string
  /** Override the rendered role when you need custom semantics. */
  role?: string
  /** Forwarded tab index for non-default keyboard ordering. */
  tabIndex?: number
  /** Forward data-* attributes, e.g. data-testid. */
  [dataAttribute: `data-${string}`]: DataAttributeValue
}

export interface OrbProps extends OrbHtmlAttributes {
  /**
   * Current voice signal. Use this controlled mode when your app has separate
   * input and output volume levels.
   */
  signal?: OrbSignal

  /**
   * Current conversation state. Required in controlled mode (no adapter).
   * Overrides signal and adapter state if provided.
   */
  state?: OrbState

  /**
   * Current audio volume, normalized 0–1.
   * Overrides signal and adapter volume if provided.
   */
  volume?: number

  /**
   * Provider adapter (Vapi, ElevenLabs, etc.).
   * Handles signal updates automatically from the SDK.
   */
  adapter?: OrbAdapter | LegacyOrbAdapter

  /** Visual theme. Defaults to 'debug'. */
  theme?: OrbTheme

  /** Size in pixels. Defaults to 200. */
  size?: number

  /** Optional class name for the rendered orb container/control. */
  className?: string

  /** Optional inline styles for the rendered orb container/control. */
  style?: CSSProperties

  /** Disable clickable themes and debug start/stop controls. */
  disabled?: boolean

  /**
   * Called when a clickable theme is activated while idle/error.
   * Overrides adapter.start() when provided.
   */
  onStart?: () => void

  /**
   * Called when a clickable theme is activated while active.
   * Overrides adapter.stop() when provided.
   */
  onStop?: () => void
}
