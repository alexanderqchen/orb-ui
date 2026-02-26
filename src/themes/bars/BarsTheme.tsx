import type { OrbState } from '../../components/VoiceOrb/VoiceOrb.types'

interface BarsThemeProps {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: React.CSSProperties
}

// TODO: Implement bars theme
// Design spec:
// - Three vertical bars, centered
// - Bar heights react to volume (with slight randomness per bar for realism)
// - Idle: all bars at minimum height, slow breathing animation
// - Thinking: bars animate in a wave pattern independent of volume
// - Error: bars turn red and drop to minimum
// Implementation: CSS + SVG

export function BarsTheme({ size, className, style }: BarsThemeProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size * 0.04,
        ...style,
      }}
    >
      {[0.4, 0.6, 0.4].map((h, i) => (
        <div
          key={i}
          style={{
            width: size * 0.08,
            height: size * h * 0.5,
            background: '#333',
            border: '1px dashed #555',
            borderRadius: 2,
          }}
        />
      ))}
      <span
        style={{
          position: 'absolute',
          fontSize: 11,
          color: '#555',
          fontFamily: 'monospace',
          marginTop: size * 0.7,
        }}
      >
        bars (todo)
      </span>
    </div>
  )
}
