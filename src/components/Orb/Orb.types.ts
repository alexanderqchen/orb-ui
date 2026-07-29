import type { AriaAttributes, CSSProperties, ReactNode } from 'react'
import type { OrbTheme } from '../../themes/config'

export type {
  BarsAppearance,
  BarsGeometry,
  BarsMotion,
  BarsThemeConfig,
  CircleAppearance,
  CircleGeometry,
  CircleMotion,
  CircleThemeConfig,
  CloudAppearance,
  CloudGeometry,
  CloudMotion,
  CloudThemeConfig,
  DebugAppearance,
  DebugGeometry,
  DebugMotion,
  DebugThemeConfig,
  OrbTheme,
  OrbThemeConfig,
  OrbThemeName,
  OrbThemePreset,
  RadialAppearance,
  RadialGeometry,
  RadialMotion,
  RadialThemeConfig,
} from '../../themes/config'

export type OrbStyle = CSSProperties & {
  /** Responsive rendered size, for example `min(70vw, 320px)`. */
  '--orb-ui-size'?: string
  /** Typed access to the stable orb-ui design-token namespace. */
  [cssVariable: `--orb-ui-${string}`]: string | number | undefined
}

export type OrbState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface OrbSignal {
  state: OrbState
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

export interface OrbSlotAttributes extends AriaAttributes {
  className?: string
  style?: CSSProperties
  id?: string
  title?: string
  role?: string
  [dataAttribute: `data-${string}`]: DataAttributeValue
}

/** Stable semantic hooks shared by the built-in themes. Unsupported slots are ignored. */
export interface OrbSlotProps {
  root?: OrbSlotAttributes
  content?: OrbSlotAttributes
  surface?: OrbSlotAttributes
  glow?: OrbSlotAttributes
  bar?: OrbSlotAttributes
  launch?: OrbSlotAttributes
  spinner?: OrbSlotAttributes
  control?: OrbSlotAttributes
  icon?: OrbSlotAttributes
  header?: OrbSlotAttributes
  label?: OrbSlotAttributes
  meterTrack?: OrbSlotAttributes
  meterFill?: OrbSlotAttributes
  actions?: OrbSlotAttributes
}

export type OrbSlotName = keyof OrbSlotProps

export interface OrbThemeComponentContext {
  state: OrbState
  active: boolean
  connecting: boolean
  disabled: boolean
  size: number
}

export type OrbThemeComponent = ReactNode | ((context: OrbThemeComponentContext) => ReactNode)

/** Replace small pieces of built-in theme chrome without replacing the entire renderer. */
export interface OrbThemeComponents {
  controlIcon?: OrbThemeComponent
  connectingIndicator?: OrbThemeComponent
}

export interface OrbThemeRendererRootProps extends OrbHtmlAttributes {
  ref: (element: HTMLElement | null) => void
  className?: string
  style?: OrbStyle
}

export interface OrbThemeRendererControlProps extends OrbHtmlAttributes {
  type: 'button'
  className?: string
  style?: CSSProperties
  disabled: boolean
  onClick?: () => void
}

export interface OrbThemeRendererProps {
  state: OrbState
  signal: OrbSignal
  inputVolume: number
  outputVolume: number
  /** Direction-selected normalized activity for the current state. */
  activity: number
  size: number
  isActive: boolean
  interactive: boolean
  disabled: boolean
  start: () => void | Promise<void>
  stop: () => void | Promise<void>
  toggle: () => void | Promise<void>
  /** Apply to the custom artwork's outer element for sizing, styling, and diagnostics. */
  rootProps: OrbThemeRendererRootProps
  /** Apply to its button to preserve Orb's lifecycle and accessible control contract. */
  controlProps: OrbThemeRendererControlProps
}

export type OrbThemeRenderer = (props: OrbThemeRendererProps) => ReactNode

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
   * Provider adapter (Vapi, ElevenLabs, etc.).
   * Handles signal updates automatically from the SDK.
   */
  adapter?: OrbAdapter

  /** Theme name or preset/override object. Defaults to 'debug'. */
  theme?: OrbTheme

  /** Size in pixels. Defaults to 200. */
  size?: number

  /** Optional class name for the rendered orb container/control. */
  className?: string

  /** Optional inline styles for the rendered orb container/control. */
  style?: OrbStyle

  /** Stable style/class hooks for semantic pieces of built-in themes. */
  slotProps?: OrbSlotProps

  /** Replace supported built-in controls such as the radial phone icon and spinner. */
  components?: OrbThemeComponents

  /** Render completely custom artwork while Orb keeps signal and lifecycle ownership. */
  renderTheme?: OrbThemeRenderer

  /** Disable interactive theme and debug start/stop controls. */
  disabled?: boolean

  /**
   * Allow the rendered theme control to start and stop an adapter-backed session.
   * Set this to false when session controls live elsewhere in your UI.
   */
  interactive?: boolean

  /**
   * Called when a clickable theme is activated while idle/error.
   * Overrides adapter.start() when provided.
   */
  onStart?: () => void | Promise<void>

  /**
   * Called when a clickable theme is activated while active.
   * Overrides adapter.stop() when provided.
   */
  onStop?: () => void | Promise<void>
}
