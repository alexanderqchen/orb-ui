import { useState, useMemo, useCallback } from 'react'
import Vapi from '@vapi-ai/web'
import { VoiceOrb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'
import type { OrbState, OrbTheme } from 'orb-ui'

// ─── Env vars (set in demo/.env.local, never committed) ──────────────────────
const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string
const VAPI_ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID as string

// ─── Constants ────────────────────────────────────────────────────────────────
const STATES: OrbState[] = [
  'idle', 'connecting', 'listening', 'thinking', 'speaking', 'error', 'disconnected',
]
const THEMES: OrbTheme[] = ['debug', 'circle', 'bars', 'jarvis']

// ─── Vapi client (singleton) ──────────────────────────────────────────────────
// Only create if the key is present — allows the demo to load without env vars
// (you'll see the orb in sandbox mode but Start won't do anything live).
const vapi = VAPI_PUBLIC_KEY ? new Vapi(VAPI_PUBLIC_KEY) : null
const adapter = vapi ? createVapiAdapter(vapi) : undefined

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState<OrbTheme>('debug')
  const [sandboxState, setSandboxState] = useState<OrbState>('idle')
  const [sandboxVolume, setSandboxVolume] = useState(0)
  const [liveMode, setLiveMode] = useState(!!adapter)
  const [connected, setConnected] = useState(false)

  // In live mode, adapter drives state. In sandbox mode, we pass state/volume manually.
  const orbProps = liveMode && adapter
    ? { adapter }
    : { state: sandboxState, volume: sandboxVolume }

  const handleStart = useCallback(async () => {
    if (!vapi || !VAPI_ASSISTANT_ID) {
      console.warn('[orb-ui demo] No VAPI_PUBLIC_KEY or VAPI_ASSISTANT_ID — running in sandbox mode only.')
      return
    }
    setConnected(true)
    // Per adapter docs: Vapi has no 'connecting' event, so set it manually here.
    // The adapter will take over once call-start fires.
    await vapi.start(VAPI_ASSISTANT_ID)
  }, [])

  const handleStop = useCallback(() => {
    vapi?.stop()
    setConnected(false)
  }, [])

  const missingEnv = !VAPI_PUBLIC_KEY || !VAPI_ASSISTANT_ID

  return (
    <div style={{ minHeight: '100vh', padding: 40, fontFamily: 'system-ui, sans-serif', background: '#0a0a0a', color: '#fff' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#fff', marginBottom: 4 }}>orb-ui</h1>
          <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
            Beautiful animated UI for voice AI agents
          </p>
        </div>

        {/* Env warning */}
        {missingEnv && (
          <div style={{
            background: '#1a1000', border: '1px solid #444', borderRadius: 6,
            padding: '10px 14px', marginBottom: 24, fontSize: 12, color: '#aaa',
          }}>
            ⚠️ <code>VITE_VAPI_PUBLIC_KEY</code> or <code>VITE_VAPI_ASSISTANT_ID</code> not set.
            Copy <code>demo/.env.example</code> → <code>demo/.env.local</code> and fill in your values to enable live mode.
          </div>
        )}

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {(['live', 'sandbox'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setLiveMode(m === 'live')}
              disabled={m === 'live' && missingEnv}
              style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                textTransform: 'uppercase',
                background: (liveMode ? m === 'live' : m === 'sandbox') ? '#fff' : '#1a1a1a',
                color: (liveMode ? m === 'live' : m === 'sandbox') ? '#000' : '#555',
                border: '1px solid #333', borderRadius: 4, cursor: m === 'live' && missingEnv ? 'not-allowed' : 'pointer',
                opacity: m === 'live' && missingEnv ? 0.4 : 1,
              }}
            >
              {m === 'live' ? '🎙 Live' : '🧪 Sandbox'}
            </button>
          ))}
        </div>

        {/* Orb preview */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          marginBottom: 40, minHeight: 260,
        }}>
          <VoiceOrb
            theme={theme}
            size={240}
            onStart={liveMode ? handleStart : undefined}
            onStop={liveMode ? handleStop : undefined}
            {...orbProps}
          />
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Theme */}
          <div>
            <label style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
              THEME
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  style={{
                    padding: '6px 14px', fontSize: 12,
                    background: theme === t ? '#fff' : '#1a1a1a',
                    color: theme === t ? '#000' : '#888',
                    border: `1px solid ${theme === t ? '#fff' : '#333'}`,
                    borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Sandbox controls (only in sandbox mode) */}
          {!liveMode && (
            <>
              <div>
                <label style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                  STATE
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {STATES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSandboxState(s)}
                      style={{
                        padding: '6px 14px', fontSize: 12,
                        background: sandboxState === s ? '#fff' : '#1a1a1a',
                        color: sandboxState === s ? '#000' : '#888',
                        border: `1px solid ${sandboxState === s ? '#fff' : '#333'}`,
                        borderRadius: 4, cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                  VOLUME — {sandboxVolume.toFixed(2)}
                </label>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={sandboxVolume}
                  onChange={(e) => setSandboxVolume(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#00d4ff' }}
                />
              </div>
            </>
          )}

          {/* Live mode status */}
          {liveMode && (
            <div style={{ fontSize: 12, color: '#555' }}>
              {connected
                ? '🟢 Connected to Vapi — speaking to Riley. Click Stop in the orb to end the call.'
                : '⚪ Click the orb to start a live call with Riley.'}
            </div>
          )}

        </div>

        {/* Footer: usage snippet */}
        <div style={{ marginTop: 48, padding: '20px 24px', background: '#111', borderRadius: 8, border: '1px solid #222' }}>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 10, letterSpacing: '0.08em' }}>USAGE</div>
          <pre style={{ fontSize: 12, color: '#aaa', margin: 0, lineHeight: 1.6, overflow: 'auto' }}>{`import Vapi from '@vapi-ai/web'
import { VoiceOrb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'

const vapi = new Vapi('your-public-key')

function App() {
  return (
    <VoiceOrb
      adapter={createVapiAdapter(vapi)}
      theme="debug"
      onStart={() => vapi.start('your-assistant-id')}
      onStop={() => vapi.stop()}
    />
  )
}`}</pre>
        </div>

      </div>
    </div>
  )
}
