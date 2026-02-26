import type { OrbState } from '../../components/VoiceOrb/VoiceOrb.types'

interface DebugThemeProps {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: React.CSSProperties
  onStart?: () => void
  onStop?: () => void
}

const ALL_STATES: OrbState[] = [
  'idle', 'connecting', 'listening', 'thinking', 'speaking', 'error', 'disconnected',
]

const STATE_COLORS: Record<OrbState, string> = {
  idle: '#888',
  connecting: '#f0c040',
  listening: '#40c0f0',
  thinking: '#c040f0',
  speaking: '#40f080',
  error: '#f04040',
  disconnected: '#555',
}

export function DebugTheme({
  state,
  volume,
  size,
  className,
  style,
  onStart,
  onStop,
}: DebugThemeProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        fontFamily: 'monospace',
        fontSize: 12,
        background: '#111',
        color: '#ccc',
        border: '1px solid #333',
        borderRadius: 8,
        padding: 12,
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
        <span style={{ color: '#555' }}>state  </span>
        <span style={{ color: STATE_COLORS[state], fontWeight: 'bold' }}>{state}</span>
      </div>

      {/* Volume */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ color: '#555' }}>volume </span>
        <span style={{ color: '#ccc' }}>{volume.toFixed(2)}</span>
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
              width: `${volume * 100}%`,
              background: STATE_COLORS[state],
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
              style={{
                fontSize: 10,
                padding: '2px 6px',
                background: state === s ? STATE_COLORS[s] : '#222',
                color: state === s ? '#000' : '#888',
                border: `1px solid ${state === s ? STATE_COLORS[s] : '#333'}`,
                borderRadius: 3,
                cursor: 'pointer',
              }}
              // Note: forcing state from the debug panel requires controlled mode.
              // In controlled mode, wire onStateChange to your own state.
              onClick={() => {
                console.warn(
                  `[orb-ui debug] To force state '${s}', use controlled mode: <VoiceOrb state="${s}" />`
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
          onClick={onStart}
          style={{
            flex: 1,
            padding: '4px 0',
            background: '#1a3a1a',
            color: '#40f080',
            border: '1px solid #40f080',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Start
        </button>
        <button
          onClick={onStop}
          style={{
            flex: 1,
            padding: '4px 0',
            background: '#3a1a1a',
            color: '#f04040',
            border: '1px solid #f04040',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Stop
        </button>
      </div>
    </div>
  )
}
