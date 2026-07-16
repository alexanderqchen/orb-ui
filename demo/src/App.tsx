import { useCallback, useEffect, useMemo, useState } from 'react'
import { Orb } from 'orb-ui'
import type { OrbSignal, OrbState, OrbTheme } from 'orb-ui'

// Constants
const STATES: OrbState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'error']
const THEMES: OrbTheme[] = ['circle', 'bars', 'cloud', 'radial', 'debug']
const GITHUB_REPO_URL = 'https://github.com/alexanderqchen/orb-ui'
const GITHUB_STAR_COLOR = '#eab308'

type DemoMode = 'simulation' | 'manual'
type CodeTab = 'vapi' | 'elevenlabs' | 'livekit' | 'pipecat' | 'openai' | 'gemini' | 'custom'
type CopyTarget = 'install' | 'code' | null

interface SimulationStep {
  state: OrbState
  duration: number
}

const SIMULATION_STEPS: SimulationStep[] = [
  { state: 'connecting', duration: 1000 },
  { state: 'listening', duration: 2600 },
  { state: 'thinking', duration: 900 },
  { state: 'speaking', duration: 3400 },
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
  return <Orb adapter={adapter} theme="circle" aria-label="Start voice assistant" />
}`

const ELEVENLABS_CODE = `import { Conversation } from "@elevenlabs/client"
import { Orb } from "orb-ui"
import { createElevenLabsAdapter } from "orb-ui/adapters"

const adapter = createElevenLabsAdapter(Conversation, {
  agentId: "your-agent-id"
})

export function VoiceOrb() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start voice assistant" />
}`

const CUSTOM_CODE = `import { Orb } from "orb-ui"
import type { OrbAdapter } from "orb-ui"

const adapter: OrbAdapter = {
  subscribe(listener) {
    const unsubscribe = voiceClient.on("signal", (signal) => {
      listener({
        state: signal.state,
        inputVolume: signal.inputVolume,
        outputVolume: signal.outputVolume
      })
    })

    return unsubscribe
  },
  start: () => voiceClient.start(),
  stop: () => voiceClient.stop()
}

export function VoiceOrb() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start voice assistant" />
}`

const LIVEKIT_CODE = `import { Orb } from "orb-ui"
import { createLiveKitAdapter } from "orb-ui/adapters/livekit"

const adapter = createLiveKitAdapter({
  tokenEndpoint: "/api/livekit-token",
  agentName: "your-agent-name"
})

function App() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start LiveKit assistant" />
}`

const PIPECAT_CODE = `import { PipecatClient } from "@pipecat-ai/client-js"
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport"
import { Orb } from "orb-ui"
import { createPipecatAdapter } from "orb-ui/adapters"

const client = new PipecatClient({
  transport: new SmallWebRTCTransport(),
  enableMic: true
})
const adapter = createPipecatAdapter(client, {
  connect: () => client.connect({ webrtcUrl: "/api/offer" })
})

export function VoiceOrb() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start Pipecat assistant" />
}`

const OPENAI_CODE = `import { Orb } from "orb-ui"
import { createOpenAIRealtimeAdapter } from "orb-ui/adapters"

const adapter = createOpenAIRealtimeAdapter({
  getClientSecret: async () => {
    const response = await fetch("/api/openai-realtime-token", { method: "POST" })
    return (await response.json()).value
  }
})

export function VoiceOrb() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start OpenAI assistant" />
}`

const GEMINI_CODE = `import { GoogleGenAI } from "@google/genai"
import { Orb } from "orb-ui"
import { createGeminiLiveAdapter } from "orb-ui/adapters"

const adapter = createGeminiLiveAdapter({
  connect: async (callbacks) => {
    const token = await fetch("/api/gemini-live-token", { method: "POST" })
      .then((response) => response.json())
    const client = new GoogleGenAI({
      apiKey: token.value,
      httpOptions: { apiVersion: "v1alpha" }
    })
    return client.live.connect({ model: token.model, config: token.config, callbacks })
  }
})

export function VoiceOrb() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start Gemini assistant" />
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

function signalFromStateVolume(state: OrbState, volume: number): OrbSignal {
  if (state === 'listening') return { state, inputVolume: volume }
  if (state === 'speaking') return { state, outputVolume: volume }
  return { state, volume }
}

function useConversationSimulation(startedAt: number) {
  const [frame, setFrame] = useState(() => getSimulationFrame(startedAt, nowMs()))

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
  { href: '#quick-start', label: 'Quick start' },
  { href: '/docs', label: 'Docs' },
  { href: '/playground', label: 'Playground' },
] as const

const PROOF_POINTS = [
  { value: '6+', label: 'Provider paths', detail: 'Plus controlled mode' },
  { value: '2-way', label: 'Audio response', detail: 'Input and output levels' },
  { value: 'A11y', label: 'Accessible controls', detail: 'Keyboard-ready semantics' },
  { value: 'MIT', label: 'Open source', detail: 'Use it anywhere' },
] as const

const CODE_OPTIONS: ReadonlyArray<{
  id: CodeTab
  label: string
  detail: string
  description: string
}> = [
  {
    id: 'vapi',
    label: 'Vapi',
    detail: 'Web SDK',
    description: 'Wrap a configured Vapi browser client and assistant.',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    detail: 'Conversational AI',
    description: 'Let the adapter own the ElevenLabs conversation lifecycle.',
  },
  {
    id: 'livekit',
    label: 'LiveKit',
    detail: 'Agents',
    description: 'Connect through a server-issued token and agent name.',
  },
  {
    id: 'pipecat',
    label: 'Pipecat',
    detail: 'RTVI',
    description: 'Use a configured client across supported transports.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    detail: 'Realtime',
    description: 'Use native browser WebRTC with short-lived client secrets.',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    detail: 'Live API',
    description: 'Open a Live session with a server-minted ephemeral token.',
  },
  {
    id: 'custom',
    label: 'Custom',
    detail: 'OrbSignal',
    description: 'Feed any WebRTC, WebSocket, or telephony runtime into controlled mode.',
  },
]

const SEO_SECTIONS = [
  {
    id: 'voice-agent-ui',
    title: 'Voice agent UI for React',
    copy: 'Animated voice orbs, audio-reactive feedback, and clear states for React voice agents.',
    link: '/docs/guides/voice-agent-ui',
    linkLabel: 'Read the guide',
  },
  {
    id: 'adapters',
    title: 'Provider adapters',
    copy: 'Use adapters for Vapi, ElevenLabs, LiveKit, Pipecat, OpenAI Realtime, and Gemini Live.',
    link: '/docs/adapters/overview',
    linkLabel: 'Explore adapters',
  },
  {
    id: 'themes',
    title: 'Themes and voice states',
    copy: 'Map listening, speaking, idle, and error states into polished visual themes.',
    link: '/docs/examples/voice-orb-ui',
    linkLabel: 'View example',
  },
  {
    id: 'custom-integrations',
    title: 'Custom voice AI integrations',
    copy: 'Connect WebRTC, WebSocket, telephony, or speech pipelines with controlled mode.',
    link: '/docs/adapters/custom',
    linkLabel: 'Build custom UI',
  },
  {
    id: 'roadmap',
    title: 'Native realtime voice adapters',
    copy: 'Drive the UI from managed browser audio, provider state, and separate input/output levels.',
    link: '/docs/adapters/openai-realtime',
    linkLabel: 'OpenAI setup',
  },
] as const

const PROVIDER_GUIDES = [
  { href: '/docs/adapters/vapi', label: 'Vapi', detail: 'Web SDK' },
  { href: '/docs/adapters/elevenlabs', label: 'ElevenLabs', detail: 'Conversational AI' },
  { href: '/docs/adapters/livekit', label: 'LiveKit', detail: 'Agents' },
  { href: '/docs/adapters/pipecat', label: 'Pipecat', detail: 'RTVI' },
  { href: '/docs/adapters/openai-realtime', label: 'OpenAI Realtime', detail: 'WebRTC' },
  { href: '/docs/adapters/gemini-live', label: 'Gemini Live', detail: 'Live API' },
  { href: '/docs/adapters/custom', label: 'Custom voice stack', detail: 'Controlled mode' },
] as const

const USE_CASE_GUIDES = [
  {
    href: '/docs/guides/ai-voice-sales-agents',
    label: 'AI voice sales agents',
    detail: 'Call status and handoff',
  },
  {
    href: '/docs/guides/voice-ai-customer-support',
    label: 'Voice AI customer support',
    detail: 'Recovery and escalation',
  },
  {
    href: '/docs/themes/voice-states',
    label: 'Voice states and themes',
    detail: 'Motion and state design',
  },
] as const

const FEATURED_GUIDE = SEO_SECTIONS[0]
const DOCUMENTATION_PATHS = SEO_SECTIONS.slice(1)

function GitHubStarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="currentColor"
      style={{
        color: GITHUB_STAR_COLOR,
        flexShrink: 0,
      }}
    >
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.88 3.81 4.205.611a.75.75 0 0 1 .416 1.279l-3.043 2.966.718 4.188a.75.75 0 0 1-1.088.79L8 12.335l-3.761 1.977a.75.75 0 0 1-1.088-.79l.718-4.188L.826 6.368a.75.75 0 0 1 .416-1.279l4.206-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
    </svg>
  )
}

function codeForTab(tab: CodeTab) {
  switch (tab) {
    case 'elevenlabs':
      return ELEVENLABS_CODE
    case 'livekit':
      return LIVEKIT_CODE
    case 'pipecat':
      return PIPECAT_CODE
    case 'openai':
      return OPENAI_CODE
    case 'gemini':
      return GEMINI_CODE
    case 'custom':
      return CUSTOM_CODE
    case 'vapi':
    default:
      return VAPI_CODE
  }
}

// App
export default function App() {
  const [simulationStartedAt] = useState(nowMs)
  const simulation = useConversationSimulation(simulationStartedAt)
  const [theme, setTheme] = useState<OrbTheme>('cloud')
  const [mode, setMode] = useState<DemoMode>('simulation')
  const [manualState, setManualState] = useState<OrbState>('idle')
  const [manualVolume, setManualVolume] = useState(0)
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget>(null)
  const [codeTab, setCodeTab] = useState<CodeTab>('vapi')

  const activeOrb = useMemo(() => {
    if (mode === 'manual') {
      return {
        mode: 'Manual',
        state: manualState,
        volume: manualVolume,
        signal: signalFromStateVolume(manualState, manualVolume),
      }
    }

    return {
      mode: 'Simulation',
      state: simulation.state,
      volume: simulation.volume,
      signal: signalFromStateVolume(simulation.state, simulation.volume),
    }
  }, [mode, manualState, manualVolume, simulation])

  const activeCodeOption = CODE_OPTIONS.find((option) => option.id === codeTab) ?? CODE_OPTIONS[0]

  const handleCopy = useCallback((target: Exclude<CopyTarget, null>, value: string) => {
    void navigator.clipboard.writeText(value)
    setCopiedTarget(target)
    window.setTimeout(() => setCopiedTarget(null), 1500)
  }, [])

  const handleManualState = useCallback((nextState: OrbState) => {
    setManualState(nextState)

    if (nextState === 'listening') {
      setManualVolume(0.35)
    } else if (nextState === 'speaking') {
      setManualVolume(0.65)
    } else {
      setManualVolume(0)
    }
  }, [])

  return (
    <div className="home-page">
      <style>{`
        :root {
          color-scheme: dark;
        }

        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          background: #0a0a0a;
          margin: 0;
        }

        button,
        a {
          font: inherit;
        }

        button {
          color: inherit;
        }

        .home-page {
          background:
            radial-gradient(circle at 78% 5%, rgba(82, 156, 255, 0.09), transparent 30rem),
            #0a0a0a;
          color: #fff;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          min-height: 100vh;
        }

        .site-nav {
          backdrop-filter: blur(18px);
          background: rgba(10, 10, 10, 0.78);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .site-nav__inner {
          align-items: center;
          display: flex;
          gap: 28px;
          justify-content: space-between;
          margin: 0 auto;
          max-width: 1080px;
          min-height: 68px;
          padding: 0 32px;
        }

        .site-nav__brand {
          align-items: center;
          color: #fff;
          display: inline-flex;
          font-size: 18px;
          font-weight: 760;
          letter-spacing: -0.03em;
          text-decoration: none;
        }

        .site-nav__brand-mark {
          background: #8bc7ff;
          border-radius: 50%;
          box-shadow: 0 0 18px rgba(87, 174, 255, 0.55);
          height: 7px;
          margin-right: 9px;
          width: 7px;
        }

        .site-nav__actions,
        .site-nav__links {
          align-items: center;
          display: flex;
        }

        .site-nav__actions {
          gap: 22px;
        }

        .site-nav__links {
          gap: 20px;
        }

        .site-nav__link {
          color: #858585;
          font-size: 13px;
          text-decoration: none;
          transition: color 160ms ease;
        }

        .site-nav__link:hover,
        .site-nav__link:focus-visible {
          color: #fff;
        }

        .github-star-button {
          align-items: center;
          background: #fffdf4;
          border: 1px solid #f0d56f;
          border-radius: 999px;
          box-shadow: 0 8px 28px rgba(234, 179, 8, 0.14);
          color: #15110a;
          display: inline-flex;
          font-size: 12px;
          font-weight: 760;
          gap: 7px;
          justify-content: center;
          line-height: 1;
          padding: 9px 13px;
          text-decoration: none;
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease;
          white-space: nowrap;
        }

        .github-star-button:hover,
        .github-star-button:focus-visible {
          border-color: #ffe58a;
          box-shadow: 0 10px 34px rgba(234, 179, 8, 0.22);
          transform: translateY(-1px);
        }

        .home-hero {
          align-items: center;
          display: grid;
          gap: clamp(44px, 7vw, 82px);
          grid-template-columns: minmax(0, 0.95fr) minmax(420px, 1.05fr);
          margin: 0 auto;
          max-width: 1080px;
          padding: clamp(70px, 9vw, 112px) 32px 70px;
        }

        .section-eyebrow {
          color: #78b9f2;
          font-family: ${MONOSPACE_FONT};
          font-size: 10px;
          font-weight: 650;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .hero-copy h1 {
          font-size: clamp(52px, 6.6vw, 76px);
          letter-spacing: -0.06em;
          line-height: 0.96;
          margin: 18px 0 0;
          max-width: 580px;
        }

        .hero-copy h1 span {
          background: linear-gradient(100deg, #fff 10%, #a9d6ff 90%);
          background-clip: text;
          color: transparent;
        }

        .hero-copy__lede {
          color: #9b9b9b;
          font-size: 16px;
          line-height: 1.75;
          margin: 26px 0 0;
          max-width: 530px;
        }

        .hero-copy__actions {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 34px;
        }

        .install-command {
          align-items: center;
          background: rgba(16, 16, 16, 0.9);
          border: 1px solid #292929;
          border-radius: 10px;
          display: flex;
          min-height: 46px;
          overflow: hidden;
        }

        .install-command code {
          color: #c7c7c7;
          font-family: ${MONOSPACE_FONT};
          font-size: 12px;
          padding: 0 15px;
          white-space: nowrap;
        }

        .install-command button,
        .code-window__copy {
          background: transparent;
          border: 0;
          color: #777;
          cursor: pointer;
          font-size: 11px;
          font-weight: 650;
          height: 100%;
          padding: 0 14px;
          transition: color 160ms ease;
        }

        .install-command button {
          border-left: 1px solid #292929;
          min-height: 44px;
        }

        .install-command button:hover,
        .install-command button:focus-visible,
        .code-window__copy:hover,
        .code-window__copy:focus-visible {
          color: #fff;
        }

        .primary-link {
          align-items: center;
          background: #eef7ff;
          border: 1px solid #fff;
          border-radius: 10px;
          color: #0c1116;
          display: inline-flex;
          font-size: 13px;
          font-weight: 720;
          gap: 8px;
          min-height: 46px;
          padding: 0 17px;
          text-decoration: none;
          transition:
            background 160ms ease,
            transform 160ms ease;
        }

        .primary-link:hover,
        .primary-link:focus-visible {
          background: #fff;
          transform: translateY(-1px);
        }

        .hero-providers {
          align-items: center;
          color: #5d5d5d;
          display: flex;
          flex-wrap: wrap;
          font-family: ${MONOSPACE_FONT};
          font-size: 10px;
          gap: 8px 12px;
          letter-spacing: 0.02em;
          margin-top: 34px;
        }

        .hero-providers a {
          color: #777;
          text-decoration: none;
          transition: color 160ms ease;
        }

        .hero-providers a:hover,
        .hero-providers a:focus-visible {
          color: #b6dcff;
        }

        .voice-stage {
          background:
            radial-gradient(circle at 50% 34%, rgba(83, 148, 255, 0.17), transparent 34%),
            linear-gradient(160deg, rgba(20, 22, 25, 0.98), rgba(12, 12, 12, 0.98));
          border: 1px solid #292c30;
          border-radius: 28px;
          box-shadow:
            0 34px 90px rgba(0, 0, 0, 0.42),
            inset 0 1px rgba(255, 255, 255, 0.025);
          min-width: 0;
          overflow: hidden;
        }

        .voice-stage__header {
          align-items: center;
          border-bottom: 1px solid #25282b;
          display: flex;
          justify-content: space-between;
          min-height: 58px;
          padding: 0 22px;
        }

        .voice-stage__title {
          color: #d9d9d9;
          font-size: 12px;
          font-weight: 650;
        }

        .voice-stage__live {
          align-items: center;
          color: #747474;
          display: inline-flex;
          font-family: ${MONOSPACE_FONT};
          font-size: 9px;
          gap: 7px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .voice-stage__live-dot {
          background: #7fc2ff;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(88, 179, 255, 0.8);
          height: 6px;
          width: 6px;
        }

        .voice-stage__surface {
          align-items: center;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 390px;
          padding: 32px 22px 24px;
        }

        .voice-stage__status {
          align-items: center;
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .voice-stage__status span {
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid #292929;
          border-radius: 999px;
          color: #818181;
          font-family: ${MONOSPACE_FONT};
          font-size: 9px;
          min-width: 70px;
          overflow: hidden;
          padding: 7px 10px;
          text-align: center;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .voice-stage__status span:last-child {
          font-variant-numeric: tabular-nums;
          min-width: 48px;
        }

        .voice-stage__controls {
          background: rgba(8, 8, 8, 0.42);
          border-top: 1px solid #25282b;
          padding: 20px 22px 22px;
        }

        .voice-stage__toolbar {
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(0, 1fr) auto;
        }

        .control-label {
          color: #5f5f5f;
          display: block;
          font-family: ${MONOSPACE_FONT};
          font-size: 8px;
          letter-spacing: 0.12em;
          margin-bottom: 9px;
          text-transform: uppercase;
        }

        .segmented-control {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .segmented-button,
        .manual-state-button {
          background: #111;
          border: 1px solid #292929;
          border-radius: 7px;
          color: #727272;
          cursor: pointer;
          font-size: 10px;
          min-height: 30px;
          padding: 0 10px;
          transition:
            background 150ms ease,
            border-color 150ms ease,
            color 150ms ease;
        }

        .segmented-button:hover,
        .segmented-button:focus-visible,
        .manual-state-button:hover,
        .manual-state-button:focus-visible {
          border-color: #454545;
          color: #ddd;
        }

        .segmented-button[aria-pressed='true'],
        .manual-state-button[aria-pressed='true'] {
          background: #edf6ff;
          border-color: #fff;
          color: #0b1116;
        }

        .manual-controls {
          border-top: 1px solid #242424;
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(0, 1fr) 130px;
          margin-top: 20px;
          padding-top: 20px;
        }

        .manual-controls__states {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .manual-controls input {
          accent-color: #9bcfff;
          width: 100%;
        }

        .proof-strip {
          margin: 0 auto;
          max-width: 1080px;
          padding: 0 32px;
        }

        .proof-strip__inner {
          border-bottom: 1px solid #242424;
          border-top: 1px solid #242424;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .proof-point {
          padding: 26px 24px;
        }

        .proof-point + .proof-point {
          border-left: 1px solid #242424;
        }

        .proof-point__value {
          color: #e8e8e8;
          display: block;
          font-family: ${MONOSPACE_FONT};
          font-size: 13px;
          font-weight: 650;
        }

        .proof-point__label {
          display: block;
          font-size: 12px;
          font-weight: 620;
          margin-top: 9px;
        }

        .proof-point__detail {
          color: #696969;
          display: block;
          font-size: 10px;
          margin-top: 4px;
        }

        .quick-start {
          margin: 0 auto;
          max-width: 1080px;
          padding: 104px 32px;
        }

        .section-header {
          align-items: end;
          display: grid;
          gap: 30px;
          grid-template-columns: minmax(0, 1.15fr) minmax(260px, 0.7fr);
          margin-bottom: 38px;
        }

        .section-header h2 {
          font-size: clamp(34px, 5vw, 54px);
          letter-spacing: -0.05em;
          line-height: 1;
          margin: 14px 0 0;
          max-width: 650px;
        }

        .section-header p {
          color: #8f8f8f;
          font-size: 14px;
          line-height: 1.7;
          margin: 0;
          max-width: 380px;
        }

        .integration-workspace {
          background: linear-gradient(145deg, #121212, #0d0d0d 70%);
          border: 1px solid #242424;
          border-radius: 22px;
          display: grid;
          grid-template-columns: 235px minmax(0, 1fr);
          overflow: hidden;
        }

        .integration-sidebar {
          border-right: 1px solid #252525;
          padding: 26px 20px;
        }

        .integration-sidebar__title {
          font-size: 13px;
          font-weight: 650;
          margin: 0 8px 5px;
        }

        .integration-sidebar__copy {
          color: #696969;
          font-size: 11px;
          line-height: 1.5;
          margin: 0 8px 22px;
        }

        .integration-list {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .integration-option {
          align-items: center;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 9px;
          cursor: pointer;
          display: grid;
          gap: 4px 10px;
          grid-template-columns: minmax(0, 1fr) auto;
          padding: 10px 11px;
          text-align: left;
          transition:
            background 150ms ease,
            border-color 150ms ease;
        }

        .integration-option:hover,
        .integration-option:focus-visible {
          background: #171717;
          border-color: #2c2c2c;
        }

        .integration-option[aria-pressed='true'] {
          background: #191c1f;
          border-color: #35414b;
        }

        .integration-option__label {
          font-size: 12px;
          font-weight: 650;
        }

        .integration-option__detail {
          color: #626262;
          font-family: ${MONOSPACE_FONT};
          font-size: 8px;
          grid-column: 1;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .integration-option__arrow {
          color: #555;
          grid-column: 2;
          grid-row: 1 / span 2;
        }

        .integration-option[aria-pressed='true'] .integration-option__arrow {
          color: #9bcfff;
        }

        .code-window {
          min-width: 0;
        }

        .code-window__header {
          align-items: center;
          border-bottom: 1px solid #252525;
          display: flex;
          justify-content: space-between;
          min-height: 64px;
          padding: 0 24px;
        }

        .code-window__meta {
          min-width: 0;
        }

        .code-window__title {
          color: #d8d8d8;
          display: block;
          font-family: ${MONOSPACE_FONT};
          font-size: 11px;
        }

        .code-window__description {
          color: #696969;
          display: block;
          font-size: 10px;
          margin-top: 5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .code-window__copy {
          min-height: 36px;
        }

        .code-window pre {
          color: #c8c8c8;
          font-family: ${MONOSPACE_FONT};
          font-size: 12px;
          line-height: 1.75;
          margin: 0;
          min-height: 410px;
          overflow: auto;
          padding: 28px 30px 34px;
          white-space: pre;
        }

        .docs-directory {
          margin: 0 auto;
          max-width: 1080px;
          padding: 0 32px;
        }

        .docs-directory__shell {
          background:
            radial-gradient(circle at 8% 0%, rgba(82, 156, 255, 0.08), transparent 32%),
            linear-gradient(145deg, #111 0%, #0d0d0d 58%, #0b0b0b 100%);
          border: 1px solid #222;
          border-radius: 24px;
          overflow: hidden;
          padding: clamp(28px, 5vw, 54px);
          position: relative;
        }

        .docs-directory__header {
          align-items: end;
          border-bottom: 1px solid #252525;
          display: grid;
          gap: 28px;
          grid-template-columns: minmax(0, 1.15fr) minmax(240px, 0.7fr);
          padding-bottom: 36px;
        }

        .docs-directory__eyebrow,
        .docs-featured__eyebrow,
        .docs-path__eyebrow {
          color: #78b9f2;
          font-family: ${MONOSPACE_FONT};
          font-size: 10px;
          font-weight: 650;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .docs-directory__title {
          font-size: clamp(32px, 5vw, 52px);
          letter-spacing: -0.045em;
          line-height: 1.02;
          margin: 14px 0 0;
          max-width: 680px;
        }

        .docs-directory__intro {
          color: #949494;
          font-size: 15px;
          line-height: 1.7;
          margin: 0;
          max-width: 390px;
        }

        .docs-directory__paths {
          display: grid;
          gap: 34px;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
          padding-top: 36px;
        }

        .docs-featured {
          background:
            radial-gradient(circle at 88% 12%, rgba(97, 177, 255, 0.18), transparent 32%),
            linear-gradient(145deg, #16191c, #111 68%);
          border: 1px solid #2b3035;
          border-radius: 18px;
          color: inherit;
          display: flex;
          flex-direction: column;
          min-height: 340px;
          overflow: hidden;
          padding: clamp(26px, 4vw, 38px);
          position: relative;
          text-decoration: none;
          transition:
            border-color 180ms ease,
            transform 180ms ease;
        }

        .docs-featured:hover,
        .docs-featured:focus-visible {
          border-color: #4d7191;
          transform: translateY(-2px);
        }

        .docs-featured:focus-visible,
        .docs-path:focus-visible,
        .docs-index-link:focus-visible {
          outline: 2px solid #d9ecff;
          outline-offset: 3px;
        }

        .docs-featured__orb {
          background: radial-gradient(
            circle at 36% 32%,
            rgba(224, 244, 255, 0.95) 0%,
            rgba(104, 188, 255, 0.78) 16%,
            rgba(39, 112, 176, 0.4) 38%,
            rgba(13, 21, 29, 0) 70%
          );
          border: 1px solid rgba(174, 221, 255, 0.12);
          border-radius: 50%;
          height: 150px;
          opacity: 0.82;
          position: absolute;
          right: -28px;
          top: -34px;
          width: 150px;
        }

        .docs-featured h3 {
          font-size: clamp(28px, 4vw, 40px);
          letter-spacing: -0.035em;
          line-height: 1.04;
          margin: auto 0 0;
          max-width: 440px;
          position: relative;
        }

        .docs-featured__copy {
          color: #a0a0a0;
          font-size: 15px;
          line-height: 1.65;
          margin: 16px 0 0;
          max-width: 460px;
          position: relative;
        }

        .docs-featured__link {
          align-items: center;
          color: #b6dcff;
          display: inline-flex;
          font-size: 14px;
          font-weight: 650;
          gap: 6px;
          margin-top: 26px;
          position: relative;
          width: fit-content;
        }

        .docs-path-list {
          border-top: 1px solid #292929;
        }

        .docs-path {
          align-items: center;
          border-bottom: 1px solid #292929;
          color: inherit;
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(0, 1fr) auto;
          padding: 20px 4px;
          text-decoration: none;
        }

        .docs-path h3 {
          font-size: 17px;
          letter-spacing: -0.015em;
          line-height: 1.25;
          margin: 6px 0 0;
          transition: color 160ms ease;
        }

        .docs-path p {
          color: #858585;
          font-size: 13px;
          line-height: 1.5;
          margin: 8px 0 0;
          max-width: 390px;
        }

        .docs-path__arrow,
        .docs-index-link__arrow {
          color: #5d5d5d;
          font-size: 18px;
          transition:
            color 160ms ease,
            transform 160ms ease;
        }

        .docs-path:hover h3,
        .docs-path:focus-visible h3 {
          color: #b6dcff;
        }

        .docs-path:hover .docs-path__arrow,
        .docs-path:focus-visible .docs-path__arrow,
        .docs-index-link:hover .docs-index-link__arrow,
        .docs-index-link:focus-visible .docs-index-link__arrow {
          color: #b6dcff;
          transform: translateX(4px);
        }

        .docs-directory__index {
          border-top: 1px solid #252525;
          display: grid;
          gap: 56px;
          grid-template-columns: minmax(0, 1.3fr) minmax(250px, 0.7fr);
          margin-top: 44px;
          padding-top: 38px;
        }

        .docs-index-group__header {
          align-items: baseline;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .docs-index-group__header h3 {
          font-size: 16px;
          margin: 0;
        }

        .docs-index-group__header span {
          color: #5d5d5d;
          font-family: ${MONOSPACE_FONT};
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .docs-index-grid {
          display: grid;
          gap: 0 24px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .docs-index-grid--single {
          grid-template-columns: 1fr;
        }

        .docs-index-link {
          align-items: center;
          border-top: 1px solid #252525;
          color: inherit;
          display: grid;
          gap: 10px;
          grid-template-columns: minmax(0, 1fr) auto;
          min-height: 58px;
          text-decoration: none;
        }

        .docs-index-link__label {
          display: block;
          font-size: 13px;
          font-weight: 600;
        }

        .docs-index-link__detail {
          color: #737373;
          display: block;
          font-size: 11px;
          margin-top: 3px;
        }

        .site-footer {
          border-top: 1px solid #202020;
          margin-top: 100px;
        }

        .site-footer__inner {
          display: grid;
          gap: 60px;
          grid-template-columns: minmax(0, 1.3fr) repeat(2, minmax(130px, 0.45fr));
          margin: 0 auto;
          max-width: 1080px;
          padding: 54px 32px 34px;
        }

        .site-footer__brand {
          color: #fff;
          font-size: 20px;
          font-weight: 760;
          letter-spacing: -0.035em;
          text-decoration: none;
        }

        .site-footer__description {
          color: #696969;
          font-size: 13px;
          line-height: 1.65;
          margin: 14px 0 0;
          max-width: 390px;
        }

        .site-footer__column h2 {
          color: #8b8b8b;
          font-family: ${MONOSPACE_FONT};
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.12em;
          margin: 0 0 16px;
          text-transform: uppercase;
        }

        .site-footer__column a {
          color: #777;
          display: block;
          font-size: 12px;
          margin-top: 11px;
          text-decoration: none;
          transition: color 160ms ease;
        }

        .site-footer__column a:hover,
        .site-footer__column a:focus-visible,
        .site-footer__legal a:hover,
        .site-footer__legal a:focus-visible {
          color: #fff;
        }

        .site-footer__legal {
          align-items: center;
          border-top: 1px solid #202020;
          color: #4f4f4f;
          display: flex;
          flex-wrap: wrap;
          font-size: 10px;
          gap: 8px 18px;
          justify-content: space-between;
          margin: 0 auto;
          max-width: 1016px;
          padding: 20px 0 28px;
        }

        .site-footer__legal a {
          color: #5d5d5d;
          text-decoration: none;
          transition: color 160ms ease;
        }

        @media (max-width: 900px) {
          .home-hero {
            grid-template-columns: 1fr;
          }

          .hero-copy {
            max-width: 680px;
          }

          .voice-stage {
            justify-self: stretch;
            max-width: 680px;
            width: 100%;
          }

          .section-header {
            align-items: start;
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 780px) {
          .proof-strip__inner {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .proof-point:nth-child(3) {
            border-left: 0;
          }

          .proof-point:nth-child(n + 3) {
            border-top: 1px solid #242424;
          }

          .quick-start {
            padding-bottom: 84px;
            padding-top: 84px;
          }

          .integration-workspace {
            grid-template-columns: 1fr;
          }

          .integration-sidebar {
            border-bottom: 1px solid #252525;
            border-right: 0;
          }

          .integration-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .docs-directory__header,
          .docs-directory__paths,
          .docs-directory__index {
            grid-template-columns: 1fr;
          }

          .docs-directory__header {
            align-items: start;
          }

          .docs-directory__paths {
            gap: 28px;
          }

          .docs-directory__index {
            gap: 38px;
          }

          .site-footer__inner {
            grid-template-columns: 1fr 1fr;
          }

          .site-footer__identity {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 560px) {
          .site-nav__inner {
            gap: 14px;
            min-height: 64px;
            padding: 0 16px;
          }

          .site-nav__actions {
            gap: 14px;
          }

          .site-nav__links {
            gap: 14px;
          }

          .site-nav__link:first-child {
            display: none;
          }

          .github-star-button {
            height: 36px;
            padding: 0;
            width: 36px;
          }

          .github-star-button__label {
            display: none;
          }

          .home-hero {
            gap: 50px;
            padding: 58px 16px 56px;
          }

          .hero-copy h1 {
            font-size: clamp(46px, 14vw, 58px);
          }

          .hero-copy__lede {
            font-size: 15px;
          }

          .hero-copy__actions,
          .install-command {
            align-items: stretch;
            width: 100%;
          }

          .install-command {
            justify-content: space-between;
          }

          .primary-link {
            justify-content: center;
          }

          .hero-providers {
            line-height: 1.6;
          }

          .voice-stage {
            border-radius: 21px;
          }

          .voice-stage__surface {
            min-height: 350px;
            overflow: hidden;
            padding-left: 10px;
            padding-right: 10px;
          }

          .voice-stage__toolbar,
          .manual-controls {
            grid-template-columns: 1fr;
          }

          .proof-strip {
            padding: 0 16px;
          }

          .proof-point {
            padding: 22px 14px;
          }

          .quick-start {
            padding-left: 16px;
            padding-right: 16px;
          }

          .section-header h2 {
            font-size: 40px;
          }

          .integration-workspace {
            border-radius: 18px;
          }

          .integration-sidebar {
            padding: 24px 20px 16px;
          }

          .integration-list {
            display: flex;
            flex-direction: row;
            margin: 0 -20px;
            overflow-x: auto;
            padding: 0 20px 8px;
            scrollbar-width: thin;
          }

          .integration-option {
            flex: 0 0 158px;
          }

          .code-window__description {
            display: none;
          }

          .code-window pre {
            font-size: 11px;
            min-height: 390px;
            padding: 24px 22px 30px;
          }

          .docs-directory {
            padding: 0 16px;
          }

          .docs-directory__shell {
            border-radius: 18px;
          }

          .docs-featured {
            min-height: 300px;
          }

          .docs-index-grid {
            grid-template-columns: 1fr;
          }

          .site-footer {
            margin-top: 80px;
          }

          .site-footer__inner {
            gap: 36px 24px;
            padding: 44px 16px 30px;
          }

          .site-footer__legal {
            margin: 0 16px;
          }
        }
      `}</style>
      <nav className="site-nav">
        <div className="site-nav__inner">
          <a href="/" className="site-nav__brand">
            <span className="site-nav__brand-mark" aria-hidden="true" />
            orb-ui
          </a>

          <div className="site-nav__actions">
            <div className="site-nav__links">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="site-nav__link">
                  {link.label}
                </a>
              ))}
            </div>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Star orb-ui on GitHub"
              className="github-star-button"
            >
              <GitHubStarIcon />
              <span className="github-star-button__label">Star on GitHub</span>
            </a>
          </div>
        </div>
      </nav>

      <main>
        <section className="home-hero">
          <div className="hero-copy">
            <div className="section-eyebrow">Open source · React voice agent UI</div>
            <h1>
              Voice agent UI that feels <span>alive.</span>
            </h1>
            <p className="hero-copy__lede">
              Give realtime voice agents a visible presence with expressive themes, clear session
              states, and provider adapters that all end at one React component.
            </p>

            <div className="hero-copy__actions">
              <div className="install-command">
                <code>npm install orb-ui</code>
                <button
                  type="button"
                  onClick={() => handleCopy('install', 'npm install orb-ui')}
                  aria-label="Copy npm install command"
                >
                  {copiedTarget === 'install' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <a href="/docs" className="primary-link">
                Read the docs <span aria-hidden="true">→</span>
              </a>
            </div>

            <div className="hero-providers" aria-label="Supported provider guides">
              <span>Native paths</span>
              {PROVIDER_GUIDES.slice(0, 6).map((provider) => (
                <a key={provider.href} href={provider.href}>
                  {provider.label}
                </a>
              ))}
            </div>
          </div>

          <div id="demo" className="voice-stage">
            <div className="voice-stage__header">
              <span className="voice-stage__title">Live voice surface</span>
              <span className="voice-stage__live">
                <span className="voice-stage__live-dot" aria-hidden="true" />
                Simulated signal
              </span>
            </div>

            <div className="voice-stage__surface">
              <Orb
                theme={theme}
                size={280}
                signal={activeOrb.signal}
                data-testid="orb-demo-visual"
              />
              <div className="voice-stage__status" aria-label="Current simulated voice signal">
                <span data-testid="orb-demo-mode">{activeOrb.mode}</span>
                <span data-testid="orb-demo-state">{activeOrb.state}</span>
                <span data-testid="orb-demo-volume">{activeOrb.volume.toFixed(2)}</span>
              </div>
            </div>

            <div className="voice-stage__controls">
              <div className="voice-stage__toolbar">
                <div>
                  <span className="control-label">Visual theme</span>
                  <div className="segmented-control" role="group" aria-label="Visual theme">
                    {THEMES.map((nextTheme) => (
                      <button
                        key={nextTheme}
                        type="button"
                        className="segmented-button"
                        aria-pressed={theme === nextTheme}
                        onClick={() => setTheme(nextTheme)}
                      >
                        {nextTheme}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="control-label">Signal source</span>
                  <div className="segmented-control" role="group" aria-label="Signal source">
                    {(
                      [
                        { id: 'simulation', label: 'Simulation' },
                        { id: 'manual', label: 'Manual' },
                      ] as const
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className="segmented-button"
                        aria-pressed={mode === id}
                        onClick={() => setMode(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {mode === 'manual' && (
                <div className="manual-controls">
                  <div>
                    <span className="control-label">Voice state</span>
                    <div className="manual-controls__states">
                      {STATES.map((state) => (
                        <button
                          key={state}
                          type="button"
                          className="manual-state-button"
                          aria-pressed={manualState === state}
                          onClick={() => handleManualState(state)}
                        >
                          {state}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="control-label" htmlFor="manual-volume">
                      Volume · {manualVolume.toFixed(2)}
                    </label>
                    <input
                      id="manual-volume"
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={manualVolume}
                      onChange={(event) => setManualVolume(parseFloat(event.target.value))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="proof-strip" aria-label="orb-ui product qualities">
          <div className="proof-strip__inner">
            {PROOF_POINTS.map((point) => (
              <div key={point.label} className="proof-point">
                <span className="proof-point__value">{point.value}</span>
                <span className="proof-point__label">{point.label}</span>
                <span className="proof-point__detail">{point.detail}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="quick-start" className="quick-start" aria-labelledby="quick-start-title">
          <header className="section-header">
            <div>
              <div className="section-eyebrow">Quick start</div>
              <h2 id="quick-start-title">Choose your stack. Keep one component.</h2>
            </div>
            <p>
              Provider adapters normalize session state and audio activity into the same Orb API.
              Start with your runtime, then make the visual experience your own.
            </p>
          </header>

          <div className="integration-workspace">
            <aside className="integration-sidebar" aria-label="Provider examples">
              <h3 className="integration-sidebar__title">Integration path</h3>
              <p className="integration-sidebar__copy">Pick a provider to update the example.</p>
              <div className="integration-list">
                {CODE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="integration-option"
                    aria-pressed={codeTab === option.id}
                    onClick={() => setCodeTab(option.id)}
                  >
                    <span className="integration-option__label">{option.label}</span>
                    <span className="integration-option__detail">{option.detail}</span>
                    <span className="integration-option__arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="code-window">
              <div className="code-window__header">
                <div className="code-window__meta">
                  <span className="code-window__title">
                    VoiceOrb.tsx · {activeCodeOption.label}
                  </span>
                  <span className="code-window__description">{activeCodeOption.description}</span>
                </div>
                <button
                  type="button"
                  className="code-window__copy"
                  onClick={() => handleCopy('code', codeForTab(codeTab))}
                  aria-label={`Copy ${activeCodeOption.label} example`}
                >
                  {copiedTarget === 'code' ? 'Copied' : 'Copy code'}
                </button>
              </div>
              <pre>
                <code>{codeForTab(codeTab)}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Documentation directory ─────────────────────────────────────── */}
        <section className="docs-directory" aria-labelledby="docs-directory-title">
          <div className="docs-directory__shell">
            <header className="docs-directory__header">
              <div>
                <div className="docs-directory__eyebrow">Documentation</div>
                <h2 id="docs-directory-title" className="docs-directory__title">
                  Build the interface around your voice agent.
                </h2>
              </div>
              <p className="docs-directory__intro">
                Start with the interaction model, connect the provider that owns your session, then
                tune the states and motion for your product.
              </p>
            </header>

            <div className="docs-directory__paths">
              <a id={FEATURED_GUIDE.id} href={FEATURED_GUIDE.link} className="docs-featured">
                <div className="docs-featured__orb" aria-hidden="true" />
                <span className="docs-featured__eyebrow">Start here · Foundations</span>
                <h3>{FEATURED_GUIDE.title}</h3>
                <p className="docs-featured__copy">{FEATURED_GUIDE.copy}</p>
                <span className="docs-featured__link">
                  {FEATURED_GUIDE.linkLabel}
                  <span aria-hidden="true">→</span>
                </span>
              </a>

              <div className="docs-path-list">
                {DOCUMENTATION_PATHS.map((section, index) => (
                  <a key={section.id} id={section.id} href={section.link} className="docs-path">
                    <div>
                      <span className="docs-path__eyebrow">
                        {String(index + 1).padStart(2, '0')} · {section.linkLabel}
                      </span>
                      <h3>{section.title}</h3>
                      <p>{section.copy}</p>
                    </div>
                    <span className="docs-path__arrow" aria-hidden="true">
                      →
                    </span>
                  </a>
                ))}
              </div>
            </div>

            <nav className="docs-directory__index" aria-label="Voice agent documentation">
              <div className="docs-index-group">
                <div className="docs-index-group__header">
                  <h3>Provider guides</h3>
                  <span>Choose your stack</span>
                </div>
                <div className="docs-index-grid">
                  {PROVIDER_GUIDES.map((guide) => (
                    <a key={guide.href} href={guide.href} className="docs-index-link">
                      <span>
                        <span className="docs-index-link__label">{guide.label}</span>
                        <span className="docs-index-link__detail">{guide.detail}</span>
                      </span>
                      <span className="docs-index-link__arrow" aria-hidden="true">
                        →
                      </span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="docs-index-group">
                <div className="docs-index-group__header">
                  <h3>Implementation guides</h3>
                  <span>Ship the experience</span>
                </div>
                <div className="docs-index-grid docs-index-grid--single">
                  {USE_CASE_GUIDES.map((guide) => (
                    <a key={guide.href} href={guide.href} className="docs-index-link">
                      <span>
                        <span className="docs-index-link__label">{guide.label}</span>
                        <span className="docs-index-link__detail">{guide.detail}</span>
                      </span>
                      <span className="docs-index-link__arrow" aria-hidden="true">
                        →
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </nav>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__identity">
            <a href="/" className="site-footer__brand">
              orb-ui
            </a>
            <p className="site-footer__description">
              Expressive, accessible React UI for realtime voice agents. Connect the session you
              already own and make every state feel clear.
            </p>
          </div>

          <div className="site-footer__column">
            <h2>Product</h2>
            <a href="/docs">Documentation</a>
            <a href="/playground">Playground</a>
            <a href="https://www.npmjs.com/package/orb-ui" target="_blank" rel="noreferrer">
              npm package
            </a>
          </div>

          <div className="site-footer__column">
            <h2>Resources</h2>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="/docs/guides/voice-agent-ui">Voice agent UI guide</a>
            <a href="/docs/adapters/overview">Adapter guide</a>
          </div>
        </div>

        <div className="site-footer__legal">
          <span>MIT License</span>
          <span>
            Built by{' '}
            <a href="https://alexanderqchen.com" target="_blank" rel="noreferrer">
              Alexander Chen
            </a>{' '}
            and{' '}
            <a href="https://www.experimental.software/" target="_blank" rel="noreferrer">
              Experimental Software
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
