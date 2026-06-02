import type { AriaAttributes, CSSProperties } from 'react'

export type OrbState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'

export type OrbTheme = 'debug' | 'circle' | 'bars'

export interface OrbAdapter {
  /**
   * Subscribe to state and volume changes from a voice provider.
   * Returns an unsubscribe function to clean up listeners.
   */
  subscribe(callbacks: {
    onStateChange: (state: OrbState) => void
    onVolumeChange: (volume: number) => void // normalized 0–1
  }): () => void

  /** Start the voice session. Called internally by Orb on click. */
  start?: () => void | Promise<void>

  /** Stop the voice session. Called internally by Orb on click. */
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
   * Current conversation state. Required in controlled mode (no adapter).
   * Overrides adapter state if both are provided.
   */
  state?: OrbState

  /**
   * Current audio volume, normalized 0–1.
   * Overrides adapter volume if both are provided.
   */
  volume?: number

  /**
   * Provider adapter (Vapi, ElevenLabs, etc.).
   * Handles state and volume automatically from the SDK.
   */
  adapter?: OrbAdapter

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
