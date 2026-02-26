export type OrbState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'
  | 'disconnected'

export type OrbTheme = 'debug' | 'circle' | 'bars' | 'jarvis'

export interface OrbAdapter {
  /**
   * Subscribe to state and volume changes from a voice provider.
   * Returns an unsubscribe function to clean up listeners.
   */
  subscribe(callbacks: {
    onStateChange: (state: OrbState) => void
    onVolumeChange: (volume: number) => void // normalized 0–1
  }): () => void
}

export interface VoiceOrbProps {
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

  className?: string
  style?: React.CSSProperties

  /** Called when the Start button is clicked (debug theme only). */
  onStart?: () => void

  /** Called when the Stop button is clicked (debug theme only). */
  onStop?: () => void
}
