import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(repoRoot, 'demo', 'public')
const siteUrl = 'https://orb-ui.com'
const ogImage = `${siteUrl}/og-image.jpg`
const lastmod = '2026-05-25'

const sharedNav = [
  ['/', 'Home'],
  ['/guides/voice-agent-ui/', 'Voice Agent UI'],
  ['/docs/vapi-voice-ui/', 'Vapi'],
  ['/docs/elevenlabs-voice-ui/', 'ElevenLabs'],
  ['/compare/voice-agent-platforms/', 'Compare'],
]

const pages = [
  {
    slug: '/guides/voice-agent-ui/',
    title: 'Voice Agent UI Components for React | orb-ui',
    description:
      'Build a React voice agent UI with animated voice orbs, audio-reactive states, provider adapters, and controlled mode for custom realtime voice AI apps.',
    eyebrow: 'Guide',
    h1: 'Voice agent UI components for React',
    intro:
      'A voice agent needs more than a microphone button. Users need to know when the agent is connecting, listening, thinking, speaking, or failing. orb-ui gives React teams a small UI layer for those moments: animated voice orbs, audio-reactive themes, provider adapters, and a controlled mode that works with any realtime voice AI stack.',
    targets: ['voice agent', 'ai voice agent', 'voice bot', 'voice agent ui'],
    sections: [
      {
        h2: 'What a voice agent UI has to communicate',
        body: [
          'The important job of a voice agent UI is trust. A user should understand whether the app heard them, whether it is still waiting, and whether the assistant is speaking. The visual state should change quickly enough to feel alive, but it should not become a distraction from the conversation.',
          'orb-ui models the basics as idle, connecting, listening, speaking, and error. Those states are enough for a first production UI, and they map cleanly to Vapi, ElevenLabs, and custom WebRTC or WebSocket voice pipelines.',
        ],
      },
      {
        h2: 'React component architecture',
        body: [
          'The core component is intentionally small. Use an adapter when a provider can supply state and audio volume for you, or use controlled mode when your app already owns the voice session lifecycle. Controlled mode is especially useful for teams experimenting with OpenAI Realtime, Gemini Live API, telephony backends, or internal speech pipelines.',
          'That split keeps orb-ui provider-agnostic. The UI does not need to know how your model streams audio. It only needs a conversation state and a normalized volume value.',
        ],
      },
      {
        h2: 'UI patterns that convert better',
        body: [
          'For developer tools, the fastest path to adoption is a visible demo, a short install command, a provider-specific code sample, and a fallback custom example. The homepage follows that pattern, and each provider page should repeat it with a more focused snippet.',
          'As the product grows, this page should become the canonical voice agent UI guide: state design, interruption handling, microphone permissions, error states, transcripts, accessibility, and theming.',
        ],
      },
    ],
    codeTitle: 'Controlled voice agent UI',
    code: `import { Orb } from 'orb-ui'

export function VoiceAgentStatus({ state, volume }) {
  return (
    <Orb
      state={state}
      volume={volume}
      theme="circle"
      size={240}
    />
  )
}`,
    cta: 'Install orb-ui and add a voice agent UI to your React app.',
    related: ['/docs/vapi-voice-ui/', '/docs/elevenlabs-voice-ui/', '/examples/voice-orb-ui/'],
  },
  {
    slug: '/docs/openai-realtime-voice-ui/',
    title: 'OpenAI Realtime Voice UI for React | orb-ui',
    description:
      'Use orb-ui controlled mode to prototype a React voice UI for OpenAI Realtime voice agents today. Dedicated OpenAI Realtime adapter support is planned.',
    eyebrow: 'Docs',
    h1: 'OpenAI Realtime voice UI for React',
    intro:
      'OpenAI Realtime is a natural fit for orb-ui because realtime voice agents need fast visual feedback. orb-ui does not ship a dedicated OpenAI Realtime adapter yet, so this page documents the honest path today: use controlled mode, map your session events into orb states, and pass normalized audio volume into the React component.',
    targets: ['gpt realtime', 'openai realtime api', 'openai voice agent'],
    sections: [
      {
        h2: 'How orb-ui fits OpenAI Realtime',
        body: [
          'The OpenAI Realtime docs describe voice-agent sessions that connect to the Realtime API, send audio or text, and listen for model responses, tool calls, and session events. Browser voice agents commonly use WebRTC, while server media pipelines can use WebSockets.',
          'orb-ui sits above that transport layer. Your Realtime integration owns authentication, session creation, audio capture, and model events. orb-ui owns the visible voice UI state.',
        ],
      },
      {
        h2: 'State mapping',
        body: [
          'Use connecting while the Realtime session is being created, listening while the microphone is active and waiting for user input, speaking while audio output is playing, and error when the session fails. If your integration exposes transcript deltas or tool calls, keep them in your app UI and use the orb as the compact status indicator.',
          'When a first-party adapter lands, it should preserve this controlled-mode mental model. The adapter should only remove boilerplate, not hide the lifecycle from teams that need control.',
        ],
      },
      {
        h2: 'Adapter roadmap',
        body: [
          'The planned adapter should support OpenAI Realtime session events, audio output activity, interruption-aware states, and a clear escape hatch for apps that already manage WebRTC or WebSocket sessions. Until then, controlled mode is the supported integration path.',
          'This page should be updated the same day an OpenAI Realtime adapter ships, with install steps, event mapping, and a complete React example.',
        ],
      },
    ],
    codeTitle: 'Prototype with controlled mode',
    code: `import { Orb } from 'orb-ui'

function OpenAIRealtimeOrb({ realtimeState, outputVolume }) {
  return (
    <Orb
      state={realtimeState}
      volume={outputVolume}
      theme="circle"
    />
  )
}`,
    cta: 'Use controlled mode now, then swap to the OpenAI Realtime adapter when it ships.',
    related: [
      '/guides/voice-agent-ui/',
      '/docs/gemini-live-voice-ui/',
      '/compare/voice-agent-platforms/',
    ],
    sources: [
      ['OpenAI Realtime docs', 'https://platform.openai.com/docs/guides/realtime'],
      ['gpt-realtime model', 'https://platform.openai.com/docs/models/gpt-realtime'],
    ],
  },
  {
    slug: '/docs/gemini-live-voice-ui/',
    title: 'Gemini Live Voice UI for React | orb-ui',
    description:
      'Use orb-ui controlled mode to build a React voice UI for Gemini Live API apps. Target Gemini Live API implementation terms, not generic Gemini live searches.',
    eyebrow: 'Docs',
    h1: 'Gemini Live voice UI for React',
    intro:
      'Gemini Live API can power realtime audio and multimodal applications, but your React app still needs to show users what is happening. orb-ui gives that frontend a simple voice UI: visual states, audio-reactive movement, and a controlled mode that can sit on top of a Gemini Live API integration.',
    targets: ['gemini live api', 'gemini voice api', 'gemini live voice ui'],
    sections: [
      {
        h2: 'Target the implementation phrase',
        body: [
          'Keyword Planner showed that generic Gemini Live searches can be noisy, including entertainment and TV-related queries. The right SEO target for orb-ui is Gemini Live API, Gemini voice API, Gemini Live voice UI, and Gemini Live React implementation content.',
          'That is also the right product framing. orb-ui should be presented as the UI layer for developers already building a realtime voice or multimodal Gemini app.',
        ],
      },
      {
        h2: 'How the UI layer connects',
        body: [
          'Google documents Gemini Live API as using a stateful WebSocket connection, with audio input and audio output modalities. In production browser flows, ephemeral tokens are recommended when connecting directly from frontend code.',
          'orb-ui does not replace that session layer. Your app maps Gemini Live connection and audio events into idle, connecting, listening, speaking, and error states, then passes those values to the Orb component.',
        ],
      },
      {
        h2: 'Adapter roadmap',
        body: [
          'A dedicated Gemini Live adapter should focus on state normalization, audio volume, and error handling. It should avoid forcing a single backend architecture because teams may choose server-to-server or client-to-server WebSocket flows.',
          'Until that adapter exists, controlled mode is the correct path for prototypes and early production experiments.',
        ],
      },
    ],
    codeTitle: 'Gemini Live controlled UI',
    code: `import { Orb } from 'orb-ui'

export function GeminiLiveStatus({ sessionState, volume }) {
  return (
    <Orb
      state={sessionState}
      volume={volume}
      theme="bars"
    />
  )
}`,
    cta: 'Prototype Gemini Live voice UI with controlled mode today.',
    related: [
      '/guides/voice-agent-ui/',
      '/docs/openai-realtime-voice-ui/',
      '/examples/voice-orb-ui/',
    ],
    sources: [['Gemini Live API docs', 'https://ai.google.dev/gemini-api/docs/live']],
  },
  {
    slug: '/docs/vapi-voice-ui/',
    title: 'Vapi Voice UI Components for React | orb-ui',
    description:
      'Add a Vapi voice UI to a React app with orb-ui. Use the Vapi adapter, animated orb visuals, and state-aware voice agent components.',
    eyebrow: 'Docs',
    h1: 'Vapi voice UI components for React',
    intro:
      'Vapi handles the voice agent platform layer. orb-ui handles the visible React UI layer: an animated voice orb, audio-reactive feedback, and predictable states that make a Vapi assistant feel present in your app.',
    targets: ['vapi alternative', 'vapi react component', 'vapi voice ui'],
    sections: [
      {
        h2: 'Use orb-ui with Vapi',
        body: [
          'The Vapi adapter connects a Vapi client to the Orb component. Once configured, the component can start and stop the conversation, listen for state changes, and react to audio volume without a custom visualizer.',
          'This is not positioned as a Vapi replacement. It is a better frontend layer for teams already building with Vapi or comparing provider stacks.',
        ],
      },
      {
        h2: 'State mapping and themes',
        body: [
          'A Vapi voice agent should clearly communicate connecting, listening, speaking, and error states. The circle theme works well for a primary assistant. The bars theme is useful when the audio-reactive element should feel more like a waveform. The debug theme helps verify the integration.',
          'Provider pages should include screenshots for each theme and a short explanation of what the user sees at every state.',
        ],
      },
      {
        h2: 'When this page should rank',
        body: [
          'This page is built for Vapi voice UI, Vapi React component, and Vapi alternative searches. The comparison angle should stay honest: orb-ui is the interface layer, while Vapi remains a voice agent platform.',
          'That distinction matters for trust and for future sponsor opportunities around provider pages.',
        ],
      },
    ],
    codeTitle: 'Vapi adapter',
    code: `import Vapi from '@vapi-ai/web'
import { Orb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'

const vapi = new Vapi('your-public-key')
const adapter = createVapiAdapter(vapi, {
  assistantId: 'your-assistant-id',
})

export function VapiVoiceUI() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start voice assistant" />
}`,
    cta: 'Install orb-ui and add a polished Vapi voice UI.',
    related: [
      '/docs/elevenlabs-voice-ui/',
      '/compare/voice-agent-platforms/',
      '/guides/voice-agent-ui/',
    ],
  },
  {
    slug: '/docs/elevenlabs-voice-ui/',
    title: 'ElevenLabs Voice UI Components for React | orb-ui',
    description:
      'Add an ElevenLabs voice UI to React with orb-ui. Use the ElevenLabs adapter, animated orb visuals, and state-aware voice agent visuals.',
    eyebrow: 'Docs',
    h1: 'ElevenLabs voice UI components for React',
    intro:
      'ElevenLabs can power conversational AI agents, while orb-ui gives those agents a visible React interface. The ElevenLabs adapter helps map the conversation lifecycle into an animated orb or bar theme so users understand when the agent is listening or speaking.',
    targets: ['elevenlabs alternative', 'elevenlabs orb', 'elevenlabs ui component'],
    sections: [
      {
        h2: 'Use orb-ui with ElevenLabs',
        body: [
          'The ElevenLabs adapter connects the ElevenLabs client conversation API to the Orb component. You configure the agent ID, render the Orb, and let the adapter handle provider state and volume updates.',
          'The result is a drop-in ElevenLabs voice UI component for React apps that need more than a plain button.',
        ],
      },
      {
        h2: 'Why this page matters',
        body: [
          'Search Console already showed impressions for ElevenLabs orb and related terms, but the homepage was carrying all provider intent. A dedicated ElevenLabs page gives Google a clearer destination and gives developers a more useful answer.',
          'This page should be linked from the homepage, README, sitemap, and any future provider comparison page.',
        ],
      },
      {
        h2: 'Designing the visual states',
        body: [
          'The most important states are idle, connecting, listening, speaking, and error. Keep the labels simple, use audio-reactive movement only while voice is active, and make failure states visible enough that users know to retry.',
          'For debugging, the debug theme can expose state and volume while teams are wiring the provider.',
        ],
      },
    ],
    codeTitle: 'ElevenLabs adapter',
    code: `import { Conversation } from '@elevenlabs/client'
import { Orb } from 'orb-ui'
import { createElevenLabsAdapter } from 'orb-ui/adapters'

const adapter = createElevenLabsAdapter(Conversation, {
  agentId: 'your-agent-id',
})

export function ElevenLabsVoiceUI() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start voice assistant" />
}`,
    cta: 'Install orb-ui and add a voice UI to an ElevenLabs agent.',
    related: ['/docs/vapi-voice-ui/', '/examples/voice-orb-ui/', '/guides/voice-agent-ui/'],
  },
  {
    slug: '/compare/voice-agent-platforms/',
    title: 'Voice Agent Platforms for React Developers | orb-ui',
    description:
      'Compare where the UI layer fits across voice agent platforms like Vapi, ElevenLabs, OpenAI Realtime, Gemini Live API, Retell AI, Bland AI, and Synthflow.',
    eyebrow: 'Comparison',
    h1: 'Voice agent platforms for React developers',
    intro:
      'Voice agent platforms make different choices about telephony, realtime media, model orchestration, tool calls, and deployment. React teams still face the same frontend problem: how do you show a live voice assistant clearly, consistently, and without rebuilding the UI for every provider?',
    targets: [
      'voice agent platforms',
      'vapi alternative',
      'bland ai alternative',
      'retell ai alternative',
    ],
    sections: [
      {
        h2: 'Separate the platform from the UI layer',
        body: [
          'Platforms such as Vapi, ElevenLabs, OpenAI Realtime, Gemini Live API, Retell AI, Bland AI, Synthflow, and Voiceflow can sit at different layers of the stack. Some focus on phone calls, some on browser realtime audio, some on agent workflows, and some on business automation.',
          'orb-ui is intentionally narrower. It is the React UI layer that can sit on top of those systems when you need a visible voice agent component.',
        ],
      },
      {
        h2: 'What to compare',
        body: [
          'For a builder, useful comparison criteria include browser support, telephony support, latency, interruption handling, tool calling, transcript access, pricing, compliance, and how much UI you must build yourself.',
          'A good comparison page should help a reader pick the right provider while making it obvious that orb-ui can travel with them across providers.',
        ],
      },
      {
        h2: 'Future sponsor surface',
        body: [
          'This page is a natural sponsorship candidate because provider comparison searches have high commercial intent. Keep the editorial content neutral and label any paid placement clearly if sponsorship is added later.',
          'The long-term value is not generic ad inventory. It is qualified attention from developers evaluating expensive voice AI tools.',
        ],
      },
    ],
    codeTitle: 'Provider-agnostic UI',
    code: `import { Orb } from 'orb-ui'

export function ProviderAgnosticVoiceUI({ state, volume }) {
  return <Orb state={state} volume={volume} theme="circle" />
}`,
    cta: 'Use orb-ui as the portable React UI layer across voice agent platforms.',
    related: [
      '/docs/vapi-voice-ui/',
      '/docs/openai-realtime-voice-ui/',
      '/docs/gemini-live-voice-ui/',
    ],
  },
  {
    slug: '/guides/ai-voice-sales-agents/',
    title: 'AI Voice Sales Agent UI Patterns | orb-ui',
    description:
      'Design React UI patterns for AI voice sales agents, AI receptionists, appointment setters, and outbound calling assistants.',
    eyebrow: 'Guide',
    h1: 'AI voice sales agent UI patterns',
    intro:
      'AI sales agents, AI receptionists, and appointment setters are high-intent voice AI use cases. The backend may handle calls, qualification, scheduling, and CRM updates, but the product still needs a user interface for live status, review, testing, and operator trust.',
    targets: ['ai sales agent', 'ai receptionist', 'ai appointment setter'],
    sections: [
      {
        h2: 'Design for trust, not decoration',
        body: [
          'A sales or receptionist agent often touches revenue directly. Users need to know when the assistant is listening, speaking, escalating, or stuck. A subtle voice orb can make a browser-based tester, admin panel, or embedded site widget feel alive without turning the UI into a cartoon.',
          'The same state model applies: idle before a call, connecting while the session starts, listening during user input, speaking during agent output, and error when the call or microphone fails.',
        ],
      },
      {
        h2: 'Builder workflow',
        body: [
          'Teams building AI voice sales agents usually need a test harness before they need a marketplace. A good UI lets them switch providers, inspect states, test prompts, and verify that interruptions or silence are handled correctly.',
          'orb-ui can become the visible layer for that harness while the voice platform handles telephony, model routing, and business logic.',
        ],
      },
      {
        h2: 'Where the content should point',
        body: [
          'This guide should link back to provider docs and the core voice agent UI guide. It should not imply that orb-ui is a CRM, dialer, or sales automation platform. The right promise is narrower: a better React UI layer for sales-oriented voice agents.',
          'That narrower promise is more credible and more useful for developer traffic.',
        ],
      },
    ],
    codeTitle: 'Sales agent status component',
    code: `import { Orb } from 'orb-ui'

export function SalesAgentCallStatus({ callState, volume }) {
  return (
    <div>
      <Orb state={callState} volume={volume} theme="circle" />
      <p>AI sales agent status: {callState}</p>
    </div>
  )
}`,
    cta: 'Use orb-ui to make sales and receptionist voice agents easier to test and trust.',
    related: ['/guides/voice-agent-ui/', '/compare/voice-agent-platforms/', '/docs/vapi-voice-ui/'],
  },
  {
    slug: '/guides/voice-ai-customer-support/',
    title: 'Voice AI Customer Support UI Patterns | orb-ui',
    description:
      'Design voice AI customer support UIs with clear listening, speaking, interruption, handoff, transcript, and error states.',
    eyebrow: 'Guide',
    h1: 'Voice AI customer support UI patterns',
    intro:
      'Customer support voice AI has some of the strongest commercial search signals in the dataset, but the product promise needs to stay precise. orb-ui is not a contact-center platform. It is a React UI layer that can make customer support voice agents easier to understand, test, and operate.',
    targets: ['conversational ai for customer service', 'ai call center agent'],
    sections: [
      {
        h2: 'Support conversations need clear state',
        body: [
          'A support user should never wonder whether the assistant is listening, speaking, paused, or failed. The UI should show connection state, active audio, and recoverable errors quickly. If a human handoff exists, the UI should make that transition obvious.',
          'orb-ui covers the compact voice status element. A full support application may also need transcripts, customer identity, routing, analytics, and escalation controls.',
        ],
      },
      {
        h2: 'Interruption and handoff patterns',
        body: [
          'The most important support-specific states are interruption, waiting, transfer, and failure recovery. orb-ui currently ships a simple state model, but the product roadmap can expand after provider adapters prove which extra states are worth standardizing.',
          'Until then, teams can pair the Orb component with their own transcript and handoff UI.',
        ],
      },
      {
        h2: 'Sponsor and revenue angle',
        body: [
          'Customer support and call-center terms have high bid prices because vendors compete for enterprise buyers. A useful, neutral builder guide can become sponsor inventory later, especially if it attracts teams evaluating voice AI tools.',
          'The page should stay educational first. Sponsorship works only if readers trust the content.',
        ],
      },
    ],
    codeTitle: 'Support voice status',
    code: `import { Orb } from 'orb-ui'

export function SupportVoiceStatus({ state, volume }) {
  return <Orb state={state} volume={volume} theme="bars" />
}`,
    cta: 'Add a clear voice status component to customer support AI workflows.',
    related: [
      '/guides/voice-agent-ui/',
      '/guides/ai-voice-sales-agents/',
      '/compare/voice-agent-platforms/',
    ],
  },
  {
    slug: '/examples/voice-orb-ui/',
    title: 'Voice Orb UI Example for React | orb-ui',
    description:
      'See a React voice orb UI example with animated states, audio-reactive motion, Vapi and ElevenLabs adapters, and custom controlled mode.',
    eyebrow: 'Example',
    h1: 'Voice orb UI example for React',
    intro:
      'Orb is not the generic industry term for every voice agent interface. It is the memorable visual shape of orb-ui. This example protects the existing search wedge around voice orb, react ai orb, and orb component while pointing developers back to broader voice agent UI language.',
    targets: ['voice orb', 'react ai orb', 'orb component'],
    sections: [
      {
        h2: 'When an orb works well',
        body: [
          'An orb works best when the voice agent needs a compact visual presence: a landing page demo, an embedded assistant, a command surface, or a product area where a full transcript would be too heavy.',
          'The orb should react to actual voice activity when possible. If audio volume is not available, state changes alone can still make the interface feel responsive.',
        ],
      },
      {
        h2: 'Voice states',
        body: [
          'Idle should feel calm. Connecting should imply progress. Listening should invite speech. Speaking should show output activity. Error should be visible without becoming alarming. Those details make the component feel useful rather than decorative.',
          'The debug theme is available when you need to verify state and volume during integration.',
        ],
      },
      {
        h2: 'From orb to voice agent UI',
        body: [
          'Search Console shows that people already find orb-ui through orb phrases. The product should keep that identity, but the docs should also teach the broader category: React voice agent UI components.',
          'That gives orb-ui both a distinctive brand and a clearer path into higher-volume voice AI searches.',
        ],
      },
    ],
    codeTitle: 'Animated voice orb',
    code: `import { Orb } from 'orb-ui'

export function VoiceOrbExample() {
  return (
    <Orb
      state="listening"
      volume={0.7}
      theme="circle"
      size={280}
    />
  )
}`,
    cta: 'Use the orb as the visible state layer for your React voice agent.',
    related: ['/guides/voice-agent-ui/', '/docs/vapi-voice-ui/', '/docs/elevenlabs-voice-ui/'],
  },
]

const css = `:root {
  color-scheme: dark;
  background: #0a0a0a;
  color: #f7f7f7;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(79, 158, 255, 0.16), transparent 32rem),
    #0a0a0a;
  color: #f7f7f7;
}

a {
  color: #d9ecff;
}

.site-nav {
  align-items: center;
  background: rgba(10, 10, 10, 0.88);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid #171717;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  justify-content: space-between;
  padding: 16px 28px;
  position: sticky;
  top: 0;
  z-index: 2;
}

.brand {
  color: #fff;
  font-weight: 750;
  text-decoration: none;
}

.nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.nav-links a {
  color: #909090;
  font-size: 14px;
  text-decoration: none;
}

.nav-links a:hover {
  color: #fff;
}

.wrap {
  margin: 0 auto;
  max-width: 1040px;
  padding: 56px 28px;
}

.hero {
  padding-top: 76px;
}

.eyebrow {
  color: #7ebcff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  margin: 0 0 16px;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(36px, 8vw, 74px);
  letter-spacing: 0;
  line-height: 0.96;
  margin: 0;
  max-width: 900px;
}

.lede {
  color: #b7b7b7;
  font-size: 19px;
  line-height: 1.7;
  margin: 24px 0 0;
  max-width: 760px;
}

.targets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}

.targets span {
  border: 1px solid #252525;
  border-radius: 999px;
  color: #c8c8c8;
  font-size: 13px;
  padding: 7px 10px;
}

.grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  margin-top: 30px;
}

.card {
  background: #101010;
  border: 1px solid #202020;
  border-radius: 8px;
  padding: 22px;
}

.card h2,
.card h3 {
  font-size: 21px;
  letter-spacing: 0;
  line-height: 1.25;
  margin: 0;
}

.card p,
.card li {
  color: #a8a8a8;
  font-size: 15px;
  line-height: 1.7;
}

.code {
  background: #050505;
  border: 1px solid #202020;
  border-radius: 8px;
  color: #d8d8d8;
  overflow-x: auto;
  padding: 22px;
}

.cta {
  align-items: center;
  background: #f7f7f7;
  border-radius: 8px;
  color: #050505;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  margin-top: 34px;
  padding: 22px;
}

.cta a {
  color: #050505;
  font-weight: 750;
}

.related {
  border-top: 1px solid #202020;
  margin-top: 42px;
  padding-top: 24px;
}

.related a {
  display: inline-block;
  margin: 0 16px 12px 0;
}

footer {
  border-top: 1px solid #171717;
  color: #777;
  font-size: 13px;
  padding: 28px;
  text-align: center;
}
`

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function absoluteUrl(slug) {
  return `${siteUrl}${slug}`
}

function breadcrumbs(page) {
  const parts = page.slug.split('/').filter(Boolean)
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'orb-ui',
        item: `${siteUrl}/`,
      },
      ...parts.map((part, index) => ({
        '@type': 'ListItem',
        position: index + 2,
        name: part
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        item: `${siteUrl}/${parts.slice(0, index + 1).join('/')}/`,
      })),
    ],
  }
}

function softwareSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: 'orb-ui',
    description:
      'React voice agent UI component library with animated voice orbs, audio-reactive themes, and provider adapters.',
    url: `${siteUrl}/`,
    codeRepository: 'https://github.com/alexanderqchen/orb-ui',
    downloadUrl: 'https://www.npmjs.com/package/orb-ui',
    applicationCategory: 'DeveloperApplication',
    programmingLanguage: 'TypeScript',
    runtimePlatform: 'React',
    license: 'https://opensource.org/licenses/MIT',
  }
}

function renderPage(page) {
  const related = page.related
    .map((slug) => {
      const relatedPage = pages.find((candidate) => candidate.slug === slug)
      return `<a href="${slug}">${escapeHtml(relatedPage?.h1 ?? slug)}</a>`
    })
    .join('')

  const sources = page.sources?.length
    ? `<div class="card"><h3>Source notes</h3><ul>${page.sources
        .map(
          ([label, href]) => `<li><a href="${href}" rel="noreferrer">${escapeHtml(label)}</a></li>`,
        )
        .join('')}</ul></div>`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <link rel="canonical" href="${absoluteUrl(page.slug)}" />
    <meta name="theme-color" content="#0a0a0a" />
    <meta name="color-scheme" content="dark light" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${absoluteUrl(page.slug)}" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="stylesheet" href="/seo.css" />
    <script type="application/ld+json">${JSON.stringify(breadcrumbs(page))}</script>
    <script type="application/ld+json">${JSON.stringify(softwareSchema())}</script>
  </head>
  <body>
    <nav class="site-nav">
      <a class="brand" href="/">orb-ui</a>
      <div class="nav-links">
        ${sharedNav.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}
        <a href="https://github.com/alexanderqchen/orb-ui" rel="noreferrer">GitHub</a>
      </div>
    </nav>
    <main>
      <section class="wrap hero">
        <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
        <h1>${escapeHtml(page.h1)}</h1>
        <p class="lede">${escapeHtml(page.intro)}</p>
        <div class="targets">
          ${page.targets.map((target) => `<span>${escapeHtml(target)}</span>`).join('')}
        </div>
      </section>
      <section class="wrap">
        <div class="grid">
          ${page.sections
            .map(
              (section) => `<article class="card">
            <h2>${escapeHtml(section.h2)}</h2>
            ${section.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
          </article>`,
            )
            .join('')}
          ${sources}
        </div>
        <article class="card" style="margin-top: 22px">
          <h2>${escapeHtml(page.codeTitle)}</h2>
          <pre class="code"><code>${escapeHtml(page.code)}</code></pre>
        </article>
        <div class="cta">
          <strong>${escapeHtml(page.cta)}</strong>
          <span><a href="https://www.npmjs.com/package/orb-ui" rel="noreferrer">npm install orb-ui</a> · <a href="https://github.com/alexanderqchen/orb-ui" rel="noreferrer">GitHub</a></span>
        </div>
        <div class="related">
          <strong>Related:</strong>
          ${related}
        </div>
      </section>
    </main>
    <footer>MIT License · Built by Alexander Chen and Experimental Software · Last updated ${lastmod}</footer>
  </body>
</html>
`
}

await fs.writeFile(path.join(publicDir, 'seo.css'), css)

for (const page of pages) {
  const dir = path.join(publicDir, page.slug)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'index.html'), renderPage(page))
}
