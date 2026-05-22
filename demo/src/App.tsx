import { useState, useCallback, useEffect, useRef } from 'react'
import * as VapiModule from '@vapi-ai/web'
import { Conversation } from '@elevenlabs/client'
import { Orb } from 'orb-ui'
import { createVapiAdapter, createElevenLabsAdapter } from 'orb-ui/adapters'
import type { OrbState, OrbTheme } from 'orb-ui'

// ─── Env vars ─────────────────────────────────────────────────────────────────
const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string
const VAPI_ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID as string
const EL_AGENT_ID = import.meta.env.VITE_EL_AGENT_ID as string

// ─── Constants ────────────────────────────────────────────────────────────────
const STATES: OrbState[] = ['idle', 'connecting', 'listening', 'speaking', 'error']
const THEMES: OrbTheme[] = ['circle', 'bars', 'debug']

type VapiClient = Parameters<typeof createVapiAdapter>[0]
type VapiConstructor = new (publicKey: string) => VapiClient

function getVapiConstructor(): VapiConstructor | null {
  const maybeDefault = (VapiModule as { default?: unknown }).default ?? VapiModule
  const maybeNestedDefault = (maybeDefault as { default?: unknown }).default ?? maybeDefault

  if (typeof maybeNestedDefault !== 'function') {
    console.error('[orb-ui demo] @vapi-ai/web did not export a Vapi constructor')
    return null
  }

  return maybeNestedDefault as VapiConstructor
}

function createVapiClient(): VapiClient | null {
  if (!VAPI_PUBLIC_KEY) return null

  const Vapi = getVapiConstructor()
  if (!Vapi) return null

  try {
    return new Vapi(VAPI_PUBLIC_KEY)
  } catch (error) {
    console.error('[orb-ui demo] Failed to create Vapi client', error)
    return null
  }
}

// ─── Singleton adapters ───────────────────────────────────────────────────────
const vapi = createVapiClient()
const vapiAdapter = vapi ? createVapiAdapter(vapi, { assistantId: VAPI_ASSISTANT_ID }) : undefined
const elAdapter = EL_AGENT_ID
  ? createElevenLabsAdapter(Conversation, { agentId: EL_AGENT_ID })
  : undefined

// ─── Code snippets ────────────────────────────────────────────────────────────
const VAPI_CODE = `import Vapi from "@vapi-ai/web"
import { Orb } from "orb-ui"
import { createVapiAdapter } from "orb-ui/adapters"

const vapi = new Vapi("your-public-key")
const adapter = createVapiAdapter(vapi, {
  assistantId: "your-assistant-id"
})

function App() {
  return <Orb adapter={adapter} theme="circle" />
}`

const EL_CODE = `import { Conversation } from "@elevenlabs/client"
import { Orb } from "orb-ui"
import { createElevenLabsAdapter } from "orb-ui/adapters"

const adapter = createElevenLabsAdapter(Conversation, {
  agentId: "your-agent-id"
})

function App() {
  return <Orb adapter={adapter} theme="circle" />
}`

const CUSTOM_CODE = `import { Orb } from "orb-ui"
import { useState } from "react"

function App() {
  const [state, setState] = useState("idle")
  const [volume, setVolume] = useState(0)

  // Connect to any voice provider — just update state and volume
  return <Orb state={state} volume={volume} theme="circle" />
}`

// ─── Shared button style helper ──────────────────────────────────────────────
function btnStyle(selected: boolean, disabled = false): React.CSSProperties {
  return {
    padding: '6px 16px',
    fontSize: 12,
    background: selected ? '#fff' : '#111',
    color: selected ? '#000' : disabled ? '#444' : '#666',
    border: `1px solid ${selected ? '#fff' : '#222'}`,
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    fontFamily: 'inherit',
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState<OrbTheme>('circle')
  const [sandboxState, setSandboxState] = useState<OrbState>('idle')
  const [sandboxVolume, setSandboxVolume] = useState(0)
  const [provider, setProvider] = useState<'vapi' | 'elevenlabs' | 'sandbox'>(() =>
    vapiAdapter ? 'vapi' : elAdapter ? 'elevenlabs' : 'sandbox',
  )
  const [copied, setCopied] = useState(false)
  const [codeTab, setCodeTab] = useState<'vapi' | 'elevenlabs' | 'custom'>('vapi')

  const adapter =
    provider === 'vapi' ? vapiAdapter : provider === 'elevenlabs' ? elAdapter : undefined

  // Stop the previous adapter's call when switching providers
  const prevAdapterRef = useRef(adapter)
  useEffect(() => {
    const prev = prevAdapterRef.current
    if (prev && prev !== adapter) {
      prev.stop?.()
    }
    prevAdapterRef.current = adapter
  }, [adapter])

  const orbProps = adapter ? { adapter } : { state: sandboxState, volume: sandboxVolume }

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText('npm install orb-ui')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [])

  const vapiMissing = !VAPI_PUBLIC_KEY || !VAPI_ASSISTANT_ID || !vapiAdapter
  const elMissing = !EL_AGENT_ID || !elAdapter

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(10,10,10,0.9)',
          backdropFilter: 'blur(12px)',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 18, color: '#fff' }}>orb-ui</span>
        <div style={{ display: 'flex', gap: 24 }}>
          <a
            href="https://github.com/alexanderqchen/orb-ui"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#888', fontSize: 14, textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
          >
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/orb-ui"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#888', fontSize: 14, textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
          >
            npm
          </a>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        style={{ padding: '80px 32px 48px', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}
      >
        <h1
          style={{
            fontSize: 'clamp(36px, 5vw, 44px)',
            fontWeight: 700,
            color: '#fff',
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          Beautiful voice AI in minutes, not days.
        </h1>
        <p style={{ fontSize: 16, color: '#888', marginTop: 16, lineHeight: 1.6 }}>
          The simplest voice AI component library for React. Works with Vapi and ElevenLabs. No
          config, no boilerplate — just drop it in.
        </p>
        <div
          style={{
            marginTop: 32,
            background: '#111',
            border: '1px solid #222',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'monospace',
            fontSize: 14,
            color: '#aaa',
          }}
        >
          <span>npm install orb-ui</span>
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#555',
              fontSize: 13,
              fontFamily: 'inherit',
              padding: '2px 6px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
          >
            {copied ? 'Copied!' : '📋'}
          </button>
        </div>
      </section>

      {/* ── Demo ────────────────────────────────────────────────────────── */}
      <section style={{ padding: '48px 32px', maxWidth: 640, margin: '0 auto' }}>
        <div
          style={{
            fontSize: 11,
            color: '#555',
            letterSpacing: '0.1em',
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          LIVE DEMO
        </div>

        {/* Orb display */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 320,
          }}
        >
          <Orb theme={theme} size={280} {...orbProps} />
        </div>

        {/* Theme switcher */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 8 }}>
            THEME
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            {THEMES.map((t) => (
              <button key={t} onClick={() => setTheme(t)} style={btnStyle(theme === t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Provider switcher */}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 8 }}>
            PROVIDER
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            {(
              [
                { id: 'vapi', label: 'Vapi 🎙', disabled: vapiMissing },
                { id: 'elevenlabs', label: 'ElevenLabs ⚡', disabled: elMissing },
                { id: 'sandbox', label: 'Sandbox 🧪', disabled: false },
              ] as const
            ).map(({ id, label, disabled }) => (
              <button
                key={id}
                onClick={() => {
                  if (!disabled) setProvider(id)
                }}
                disabled={disabled}
                style={btnStyle(provider === id, disabled)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sandbox controls */}
        {provider === 'sandbox' && (
          <div
            style={{
              marginTop: 24,
              padding: '20px 24px',
              background: '#111',
              border: '1px solid #1e1e1e',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 16 }}>
              PLAYGROUND
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {STATES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSandboxState(s)}
                  style={btnStyle(sandboxState === s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <div>
              <label
                style={{
                  fontSize: 11,
                  color: '#555',
                  letterSpacing: '0.1em',
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                VOLUME — {sandboxVolume.toFixed(2)}
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sandboxVolume}
                onChange={(e) => setSandboxVolume(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#4f9eff' }}
              />
            </div>
          </div>
        )}

        {/* Live provider hint */}
        {provider !== 'sandbox' && (
          <div style={{ marginTop: 16, fontSize: 13, color: '#555', textAlign: 'center' }}>
            Click the orb to start or stop a live conversation.
          </div>
        )}
      </section>

      {/* ── Code ────────────────────────────────────────────────────────── */}
      <section style={{ padding: '48px 32px', maxWidth: 640, margin: '0 auto' }}>
        <div
          style={{
            fontSize: 11,
            color: '#555',
            letterSpacing: '0.1em',
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          QUICK START
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setCodeTab('vapi')} style={btnStyle(codeTab === 'vapi')}>
            Vapi
          </button>
          <button
            onClick={() => setCodeTab('elevenlabs')}
            style={btnStyle(codeTab === 'elevenlabs')}
          >
            ElevenLabs
          </button>
          <button onClick={() => setCodeTab('custom')} style={btnStyle(codeTab === 'custom')}>
            Custom
          </button>
        </div>

        <pre
          style={{
            background: '#111',
            border: '1px solid #1e1e1e',
            borderRadius: 8,
            padding: '20px 24px',
            fontFamily: 'monospace',
            fontSize: 13,
            color: '#ccc',
            lineHeight: 1.7,
            overflowX: 'auto',
            whiteSpace: 'pre',
            margin: 0,
          }}
        >
          {codeTab === 'vapi' ? VAPI_CODE : codeTab === 'elevenlabs' ? EL_CODE : CUSTOM_CODE}
        </pre>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        style={{
          padding: 32,
          textAlign: 'center',
          borderTop: '1px solid #111',
          marginTop: 32,
          fontSize: 13,
          color: '#555',
        }}
      >
        <div>
          MIT License · Built by{' '}
          <a
            href="https://alexanderqchen.com"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#555', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#aaa')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
          >
            Alexander Chen
          </a>{' '}
          &{' '}
          <a
            href="https://www.experimental.software/"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#555', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#aaa')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
          >
            Experimental Software
          </a>
        </div>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 16 }}>
          <a
            href="https://github.com/alexanderqchen/orb-ui"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#555', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#aaa')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
          >
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/orb-ui"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#555', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#aaa')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
          >
            npm
          </a>
        </div>
      </footer>
    </div>
  )
}
