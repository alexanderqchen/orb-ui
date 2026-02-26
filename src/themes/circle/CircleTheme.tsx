import type { OrbState } from '../../components/VoiceOrb/VoiceOrb.types'

interface CircleThemeProps {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: React.CSSProperties
}

// TODO: Implement circle theme
// Design spec:
// - A single circle, centered
// - Scale and glow based on volume during 'speaking' and 'listening'
// - Slow idle pulse when state is 'idle'
// - Distinct animation for 'thinking' (e.g. rotating dashed border)
// - Color shifts per state (muted default, active color when speaking)
// Implementation: CSS + SVG

export function CircleTheme({ size, className, style }: CircleThemeProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <div
        style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: '50%',
          background: '#333',
          border: '2px dashed #555',
        }}
      />
      <span
        style={{
          position: 'absolute',
          fontSize: 11,
          color: '#555',
          fontFamily: 'monospace',
        }}
      >
        circle (todo)
      </span>
    </div>
  )
}
