import { useState } from 'react'
import { VoiceOrb } from 'orb-ui'
import type { OrbState, OrbTheme } from 'orb-ui'

const STATES: OrbState[] = [
  'idle', 'connecting', 'listening', 'thinking', 'speaking', 'error', 'disconnected',
]

const THEMES: OrbTheme[] = ['debug', 'circle', 'bars', 'jarvis']

export default function App() {
  const [theme, setTheme] = useState<OrbTheme>('debug')
  const [state, setState] = useState<OrbState>('idle')
  const [volume, setVolume] = useState(0)

  return (
    <div style={{ minHeight: '100vh', padding: 40 }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 24, color: '#fff', marginBottom: 4 }}>orb-ui</h1>
          <p style={{ color: '#555', fontSize: 13 }}>
            Beautiful animated UI for voice AI agents
          </p>
        </div>

        {/* Preview */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 40,
            minHeight: 260,
          }}
        >
          <VoiceOrb
            theme={theme}
            state={state}
            volume={volume}
            size={240}
            onStart={() => setState('listening')}
            onStop={() => setState('idle')}
          />
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Theme */}
          <div>
            <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 8 }}>
              THEME
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    background: theme === t ? '#fff' : '#1a1a1a',
                    color: theme === t ? '#000' : '#888',
                    border: `1px solid ${theme === t ? '#fff' : '#333'}`,
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* State */}
          <div>
            <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 8 }}>
              STATE
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STATES.map((s) => (
                <button
                  key={s}
                  onClick={() => setState(s)}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    background: state === s ? '#fff' : '#1a1a1a',
                    color: state === s ? '#000' : '#888',
                    border: `1px solid ${state === s ? '#fff' : '#333'}`,
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Volume */}
          <div>
            <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 8 }}>
              VOLUME — {volume.toFixed(2)}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#00d4ff' }}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
