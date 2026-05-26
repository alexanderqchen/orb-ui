import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Orb } from 'orb-ui'
import type { OrbState, OrbTheme } from 'orb-ui'

// Constants
const STATES: OrbState[] = ['idle', 'connecting', 'listening', 'speaking', 'error']
const THEMES: OrbTheme[] = ['circle', 'bars', 'debug']

type DemoMode = 'simulation' | 'sandbox'
type CodeTab = 'vapi' | 'elevenlabs' | 'adapter' | 'controlled'

interface SimulationStep {
  state: OrbState
  duration: number
}

const SIMULATION_STEPS: SimulationStep[] = [
  { state: 'idle', duration: 1300 },
  { state: 'connecting', duration: 1000 },
  { state: 'speaking', duration: 3400 },
  { state: 'listening', duration: 2600 },
]

const SIMULATION_DURATION = SIMULATION_STEPS.reduce((total, step) => total + step.duration, 0)
const MONOSPACE_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'

const VAPI_CODE = `import Vapi from "@vapi-ai/web"
import { Orb } from "orb-ui"
import { createVapiAdapter } from "orb-ui/adapters"

const vapi = new Vapi("your-public-key")
const adapter = createVapiAdapter(vapi, {
  assistantId: "your-assistant-id"
})

export function VoiceOrb() {
  return <Orb adapter={adapter} theme="circle" />
}`

const ELEVENLABS_CODE = `import { Conversation } from "@elevenlabs/client"
import { Orb } from "orb-ui"
import { createElevenLabsAdapter } from "orb-ui/adapters"

const adapter = createElevenLabsAdapter(Conversation, {
  agentId: "your-agent-id"
})

export function VoiceOrb() {
  return <Orb adapter={adapter} theme="circle" />
}`

const ADAPTER_CODE = `import { Orb } from "orb-ui"
import type { OrbAdapter } from "orb-ui"

const adapter: OrbAdapter = {
  subscribe({ onStateChange, onVolumeChange }) {
    voiceClient.on("state", onStateChange)
    voiceClient.on("volume", onVolumeChange)

    return () => {
      voiceClient.off("state", onStateChange)
      voiceClient.off("volume", onVolumeChange)
    }
  },
  start: () => voiceClient.start(),
  stop: () => voiceClient.stop()
}

export function VoiceOrb() {
  return <Orb adapter={adapter} theme="circle" />
}`

const CONTROLLED_CODE = `import { useEffect, useState } from "react"
import { Orb } from "orb-ui"
import type { OrbState } from "orb-ui"

export function PreviewOrb() {
  const [signal, setSignal] = useState({
    state: "listening" as OrbState,
    volume: 0
  })

  useEffect(() => {
    let frame = 0

    function tick() {
      const t = performance.now() / 1000
      const state = Math.floor(t / 3) % 2 === 0 ? "speaking" : "listening"
      const volume = Math.max(0, Math.min(1, 0.45 + Math.sin(t * 9) * 0.3))

      setSignal({ state, volume })
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [])

  return <Orb state={signal.state} volume={signal.volume} theme="circle" />
}`

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function envelope(elapsed: number, duration: number) {
  const fadeIn = clamp(elapsed / 320)
  const fadeOut = clamp((duration - elapsed) / 360)
  return Math.min(fadeIn, fadeOut)
}

function nowMs() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function simulatedVolume(step: SimulationStep, elapsed: number) {
  if (step.state !== 'listening' && step.state !== 'speaking') return 0

  const t = elapsed / 1000
  const shape = envelope(elapsed, step.duration)

  if (step.state === 'listening') {
    const voice =
      0.22 + Math.sin(t * 7.7) * 0.1 + Math.sin(t * 13.1 + 0.8) * 0.07 + Math.sin(t * 21.2) * 0.04

    return clamp(voice * shape, 0.02, 0.58)
  }

  const voice =
    0.5 + Math.sin(t * 8.4) * 0.19 + Math.sin(t * 15.6 + 1.2) * 0.13 + Math.sin(t * 25.2) * 0.07

  return clamp(voice * shape, 0.05, 0.95)
}

function getSimulationFrame(startedAt: number, now: number) {
  let elapsed = (now - startedAt) % SIMULATION_DURATION

  for (const step of SIMULATION_STEPS) {
    if (elapsed <= step.duration) {
      return {
        state: step.state,
        volume: simulatedVolume(step, elapsed),
      }
    }

    elapsed -= step.duration
  }

  return {
    state: 'idle' as OrbState,
    volume: 0,
  }
}

function useConversationSimulation() {
  const [startedAt] = useState(() => nowMs())
  const [frame, setFrame] = useState(() => getSimulationFrame(nowMs(), nowMs()))

  useEffect(() => {
    let raf = 0

    const updateFrame = () => {
      setFrame(getSimulationFrame(startedAt, nowMs()))
      raf = requestAnimationFrame(updateFrame)
    }

    updateFrame()

    return () => cancelAnimationFrame(raf)
  }, [startedAt])

  return frame
}

const NAV_LINKS = [
  { href: '#demo', label: 'Demo' },
  { href: '#providers', label: 'Providers' },
  { href: '#themes', label: 'Themes' },
  { href: '#quick-start', label: 'Quick Start' },
  { href: 'https://github.com/alexanderqchen/orb-ui', label: 'GitHub', external: true },
] as const

const SEO_SECTIONS = [
  {
    id: 'voice-agent-ui',
    title: 'Voice agent UI for React',
    copy: 'orb-ui gives React apps a polished voice agent UI layer: animated voice orbs, audio-reactive visual feedback, and clear conversation states for idle, connecting, listening, speaking, and error flows.',
    link: '/guides/voice-agent-ui/',
    linkLabel: 'Read the voice agent UI guide',
  },
  {
    id: 'providers',
    title: 'Provider adapters',
    copy: 'Use built-in provider adapters for Vapi and ElevenLabs, or keep full control with state and volume props when you are integrating custom realtime voice agents.',
    link: '/docs/vapi-voice-ui/',
    linkLabel: 'Explore Vapi voice UI docs',
  },
  {
    id: 'themes',
    title: 'Themes and voice states',
    copy: 'Start with the animated orb, bars, or debug theme, then map your voice agent lifecycle into consistent visual states users can understand at a glance.',
    link: '/examples/voice-orb-ui/',
    linkLabel: 'View the voice orb UI example',
  },
  {
    id: 'custom-integrations',
    title: 'Custom voice AI integrations',
    copy: 'Controlled mode works with any voice AI stack. Connect your own WebRTC, WebSocket, telephony, or speech pipeline and pass state plus audio volume directly to the Orb component.',
    link: '/guides/voice-agent-ui/',
    linkLabel: 'Build a custom voice agent UI',
  },
  {
    id: 'roadmap',
    title: 'Coming next: OpenAI Realtime and Gemini Live',
    copy: 'OpenAI Realtime and Gemini Live adapters are planned next. Today, you can already use controlled mode to prototype a React voice UI for those realtime voice agent stacks.',
    link: '/docs/openai-realtime-voice-ui/',
    linkLabel: 'Preview OpenAI Realtime voice UI notes',
  },
] as const

function btnStyle(selected: boolean, disabled = false): CSSProperties {
  return {
    padding: '6px 16px',
    fontSize: 12,
    background: selected ? '#fff' : '#111',
    color: selected ? '#000' : disabled ? '#444' : '#777',
    border: `1px solid ${selected ? '#fff' : '#242424'}`,
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  }
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: '#555',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

const volumeTextStyle: CSSProperties = {
  display: 'inline-block',
  width: '100%',
  minWidth: '4ch',
  textAlign: 'right',
  fontFamily: MONOSPACE_FONT,
  fontVariantNumeric: 'tabular-nums',
}

const statusStripStyle: CSSProperties = {
  marginTop: 16,
  display: 'grid',
  gridTemplateColumns: '82px 8px 82px 8px 44px',
  alignItems: 'center',
  justifyItems: 'center',
  gap: 6,
  width: 248,
  color: '#777',
  fontSize: 13,
  whiteSpace: 'nowrap',
}

const statusCellStyle: CSSProperties = {
  width: '100%',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const statusSeparatorStyle: CSSProperties = {
  color: '#333',
  textAlign: 'center',
}

function codeForTab(tab: CodeTab) {
  switch (tab) {
    case 'elevenlabs':
      return ELEVENLABS_CODE
    case 'adapter':
      return ADAPTER_CODE
    case 'controlled':
      return CONTROLLED_CODE
    case 'vapi':
    default:
      return VAPI_CODE
  }
}

// App
export default function App() {
  const simulation = useConversationSimulation()
  const [theme, setTheme] = useState<OrbTheme>('circle')
  const [mode, setMode] = useState<DemoMode>('simulation')
  const [sandboxState, setSandboxState] = useState<OrbState>('idle')
  const [sandboxVolume, setSandboxVolume] = useState(0)
  const [copied, setCopied] = useState(false)
  const [codeTab, setCodeTab] = useState<CodeTab>('vapi')

  const activeOrb = useMemo(() => {
    if (mode === 'sandbox') {
      return {
        mode: 'Sandbox',
        state: sandboxState,
        volume: sandboxVolume,
      }
    }

    return {
      mode: 'Simulation',
      state: simulation.state,
      volume: simulation.volume,
    }
  }, [mode, sandboxState, sandboxVolume, simulation])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText('npm install orb-ui')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }, [])

  const handleSandboxState = useCallback((nextState: OrbState) => {
    setSandboxState(nextState)

    if (nextState === 'listening') {
      setSandboxVolume((volume) => (volume === 0 ? 0.35 : volume))
    } else if (nextState === 'speaking') {
      setSandboxVolume((volume) => (volume === 0 ? 0.65 : volume))
    } else {
      setSandboxVolume(0)
    }
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
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
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <a
          href="/"
          style={{ fontWeight: 700, fontSize: 18, color: '#fff', textDecoration: 'none' }}
        >
          orb-ui
        </a>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noreferrer' : undefined}
              style={{ color: '#888', fontSize: 14, textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>

      <section
        style={{ padding: '80px 32px 48px', textAlign: 'center', maxWidth: 680, margin: '0 auto' }}
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
          React voice agent UI components
        </h1>
        <p style={{ fontSize: 16, color: '#888', marginTop: 16, lineHeight: 1.6 }}>
          orb-ui is a React voice agent UI library with animated orb components, audio-reactive
          themes, Vapi and ElevenLabs adapters, and controlled mode for custom realtime voice
          agents.
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
            gap: 16,
            fontFamily: 'monospace',
            fontSize: 14,
            color: '#aaa',
          }}
        >
          <span style={{ overflowWrap: 'anywhere' }}>npm install orb-ui</span>
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#777',
              fontSize: 13,
              fontFamily: 'inherit',
              padding: '2px 6px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#777')}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      {/* ── Demo ────────────────────────────────────────────────────────── */}
      <section id="demo" style={{ padding: '48px 32px', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ ...labelStyle, textAlign: 'center', marginBottom: 32 }}>Simulated demo</div>

        <div
          style={{
            width: 300,
            minHeight: 300,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Orb theme={theme} size={280} state={activeOrb.state} volume={activeOrb.volume} />

          <div style={statusStripStyle}>
            <span style={statusCellStyle}>{activeOrb.mode}</span>
            <span style={statusSeparatorStyle}>/</span>
            <span style={statusCellStyle}>{activeOrb.state}</span>
            <span style={statusSeparatorStyle}>/</span>
            <span style={volumeTextStyle}>{activeOrb.volume.toFixed(2)}</span>
          </div>
        </div>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Theme</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {THEMES.map((t) => (
              <button key={t} onClick={() => setTheme(t)} style={btnStyle(theme === t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Mode</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {(
              [
                { id: 'simulation', label: 'Simulation' },
                { id: 'sandbox', label: 'Sandbox' },
              ] as const
            ).map(({ id, label }) => (
              <button key={id} onClick={() => setMode(id)} style={btnStyle(mode === id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'sandbox' && (
          <div
            style={{
              margin: '24px auto 0',
              maxWidth: 420,
              padding: '20px 24px',
              background: '#111',
              border: '1px solid #1e1e1e',
              borderRadius: 8,
            }}
          >
            <div style={{ ...labelStyle, marginBottom: 16 }}>Playground</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {STATES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSandboxState(s)}
                  style={btnStyle(sandboxState === s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <div>
              <label
                style={{
                  ...labelStyle,
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                Volume / {sandboxVolume.toFixed(2)}
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sandboxVolume}
                onChange={(e) => setSandboxVolume(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#d9d9d9' }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── SEO Content ─────────────────────────────────────────────────── */}
      <section style={{ padding: '32px 32px 16px', maxWidth: 980, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {SEO_SECTIONS.map((section) => (
            <article
              key={section.id}
              id={section.id}
              style={{
                background: '#101010',
                border: '1px solid #1f1f1f',
                borderRadius: 8,
                padding: 20,
              }}
            >
              <h2 style={{ fontSize: 18, color: '#fff', margin: 0, lineHeight: 1.3 }}>
                {section.title}
              </h2>
              <p style={{ fontSize: 14, color: '#9a9a9a', marginTop: 12, lineHeight: 1.65 }}>
                {section.copy}
              </p>
              <a
                href={section.link}
                style={{
                  color: '#d9ecff',
                  display: 'inline-block',
                  fontSize: 13,
                  marginTop: 12,
                  textDecoration: 'none',
                }}
              >
                {section.linkLabel}
              </a>
            </article>
          ))}
        </div>
      </section>

      {/* ── Code ────────────────────────────────────────────────────────── */}
      <section id="quick-start" style={{ padding: '48px 32px', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ ...labelStyle, marginBottom: 24, textAlign: 'center' }}>Quick start</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setCodeTab('vapi')} style={btnStyle(codeTab === 'vapi')}>
            Vapi
          </button>
          <button
            onClick={() => setCodeTab('elevenlabs')}
            style={btnStyle(codeTab === 'elevenlabs')}
          >
            ElevenLabs
          </button>
          <button onClick={() => setCodeTab('adapter')} style={btnStyle(codeTab === 'adapter')}>
            Adapter
          </button>
          <button
            onClick={() => setCodeTab('controlled')}
            style={btnStyle(codeTab === 'controlled')}
          >
            Controlled
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
          {codeForTab(codeTab)}
        </pre>
      </section>

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
          MIT License - Built by{' '}
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
          and{' '}
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
