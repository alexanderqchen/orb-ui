import type { CSSProperties, HTMLAttributes } from 'react'
import type { OrbState } from '../../components/Orb/Orb.types'
import type { ResolvedDebugTheme } from '../config'

type DebugThemeRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>

interface DebugThemeProps extends DebugThemeRootProps {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: CSSProperties
  disabled?: boolean
  onStart?: () => void
  onStop?: () => void
  config: ResolvedDebugTheme
}

const ALL_STATES: OrbState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'error']

export function DebugTheme({
  state,
  volume,
  size,
  className,
  style,
  disabled = false,
  onStart,
  onStop,
  config,
  ...rootProps
}: DebugThemeProps) {
  const displayedVolume = Math.pow(Math.max(0, volume), config.motion.responseExponent)

  return (
    <div
      {...rootProps}
      className={className}
      style={{
        width: size,
        fontFamily: 'monospace',
        fontSize: 12,
        background: config.appearance.backgroundColor,
        color: config.appearance.textColor,
        border: `1px solid ${config.appearance.borderColor}`,
        borderRadius: config.geometry.borderRadius,
        padding: config.geometry.padding,
        boxSizing: 'border-box',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ color: '#555', marginBottom: 10, fontSize: 10, letterSpacing: 1 }}>
        ORB DEBUG
      </div>

      {/* State */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#555' }}>state </span>
        <span style={{ color: config.appearance.colors[state], fontWeight: 'bold' }}>{state}</span>
      </div>

      {/* Volume */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ color: '#555' }}>volume </span>
        <span style={{ color: config.appearance.textColor }}>{displayedVolume.toFixed(2)}</span>
        <div
          style={{
            marginTop: 4,
            height: 4,
            background: '#222',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${displayedVolume * 100}%`,
              background: config.appearance.colors[state],
              borderRadius: 2,
              transition: 'width 50ms linear',
            }}
          />
        </div>
      </div>

      {/* State buttons */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: '#555', marginBottom: 4, fontSize: 10 }}>force state</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ALL_STATES.map((s) => (
            <button
              key={s}
              disabled={disabled}
              style={{
                fontSize: 10,
                padding: '2px 6px',
                background: state === s ? config.appearance.colors[s] : '#222',
                color: state === s ? '#000' : '#888',
                border: `1px solid ${state === s ? config.appearance.colors[s] : '#333'}`,
                borderRadius: 3,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              // Note: forcing state from the debug panel requires controlled mode.
              // In controlled mode, wire this to your own state setter.
              onClick={() => {
                console.warn(
                  `[orb-ui debug] To force state '${s}', use controlled mode: <Orb state="${s}" />`,
                )
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Start / Stop */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          disabled={disabled}
          onClick={onStart}
          style={{
            flex: 1,
            padding: '4px 0',
            background: '#1a3a1a',
            color: '#40f080',
            border: '1px solid #40f080',
            borderRadius: 4,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 11,
          }}
        >
          Start
        </button>
        <button
          disabled={disabled}
          onClick={onStop}
          style={{
            flex: 1,
            padding: '4px 0',
            background: '#3a1a1a',
            color: '#f04040',
            border: '1px solid #f04040',
            borderRadius: 4,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 11,
          }}
        >
          Stop
        </button>
      </div>
    </div>
  )
}
