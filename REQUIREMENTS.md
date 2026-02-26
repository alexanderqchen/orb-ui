# Orb — Requirements

## Vision

Orb is an open source React component library that provides a beautiful, animated visual layer for voice AI agents. A developer should be able to add a stunning voice AI UI to their app in 2 lines of code.

```jsx
import { VoiceOrb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'

<VoiceOrb adapter={createVapiAdapter(client)} theme="jarvis" />
```

---

## Core Concept

Voice agents (built on Vapi, ElevenLabs, Pipecat, Bland, etc.) are purely audio — they have no visual layer. Orb fills that gap with animated components that respond to the state and audio of the conversation in real time. The result should feel like interacting with an AI from a sci-fi film, not a basic loading spinner.

---

## States

The component must react to the following conversation states:

| State | Description |
|---|---|
| `idle` | No active session. Component is dormant/minimal. |
| `connecting` | Session is being established. |
| `listening` | User's turn — AI is receiving audio input. |
| `thinking` | AI is processing — no audio, awaiting response. |
| `speaking` | AI's turn — AI is producing audio output. |
| `error` | Something went wrong. |
| `disconnected` | Session has ended. |

The `thinking` state is a key differentiator — most voice UIs skip this entirely. It should feel cognitively distinct (not just "paused") — something is happening, just internally.

---

## Audio Reactivity

The component should react to real-time audio volume/amplitude data:

- During `listening`: visualization reacts to the **user's** microphone input
- During `speaking`: visualization reacts to the **AI's** audio output
- During `thinking`: visualization is in a distinct non-reactive animated state (e.g. slow pulse, internal animation)
- Volume data should be normalized (0–1 float) so it's consistent across providers

---

## Integration Architecture

### First-Party Provider Integrations

Orb ships with built-in adapters for major voice agent platforms. These handle state detection and volume extraction automatically — developers just pass their SDK client.

**Initial targets:**
- Vapi
- ElevenLabs (Conversational AI)
- Pipecat
- Bland

Each adapter:
- Listens to the provider's SDK events and maps them to Orb's state enum
- Extracts real-time volume/amplitude data from the audio stream
- Handles connection/disconnection lifecycle

### Custom Mode

For maximum flexibility, Orb also accepts manual control:

```jsx
<VoiceOrb
  state="speaking"
  volume={0.72}
  theme="minimal"
/>
```

This allows developers to:
- Integrate with any provider not officially supported
- Build their own adapter layer
- Use Orb in non-standard setups (e.g. simulated/demo mode)

---

## Themes

Themes are the visual identity of the component. Each theme is a complete, self-contained animation style.

### Tier 0 — Debug Theme (build first for DX)

A transparent, text-based theme for developers verifying their integration. Not meant to be used in production.

| Theme | Description |
|---|---|
| `debug` | Shows current state and volume as text. Includes manual Start/Stop buttons to trigger state changes without a real voice session. Useful for confirming the integration is wired up correctly before adding a visual theme. |

Example appearance:
```
State:  speaking
Volume: 0.72

[Start]  [Stop]
```

### Tier 1 — Simple Presets (build first for utility)

Clean, minimal, broadly usable. These are what most developers will default to.

| Theme | Description |
|---|---|
| `circle` | Classic pulsing circle. Scales/glows with volume. |
| `bars` | Three vertical bars (classic voice visualizer). Height reacts to volume. |

Both should support basic customization: color, size, border radius overrides via props or CSS variables.

### Tier 2 — Sci-Fi Styles (build first for demos and virality)

Cinematic, complex, high-effort animations. These are the reason people will share and star the repo. Despite being harder to build, **at least one Tier 2 theme should be the first thing demoed publicly.**

| Theme | Description |
|---|---|
| `jarvis` | Thin concentric rings, arc segments, scanning lines. Inspired by Iron Man HUD. |
| `hal` | Single glowing iris/eye. Minimal and unsettling. Inspired by 2001: A Space Odyssey. |
| `glados` | Geometric lattice pattern. Angular, cold. Inspired by Portal. |
| `pulse` | Radial waveform that emanates outward from center. Organic but clean. |

Each sci-fi theme should have distinct animations per state — especially `thinking`, which should feel meaningfully different from `speaking` and `listening`.

---

## Developer Experience Goals

- **npm install orb** — zero config to get started
- **TypeScript first** — full type safety, great autocomplete
- **No required peer dependencies beyond React** — don't force specific animation libraries on the user
- **Tree-shakeable** — only import what you use
- **Accessible** — proper ARIA labels for screen readers (e.g. "AI is speaking")
- **Headless option** — expose state/volume hooks for developers who want to build their own visuals on top of Orb's provider integrations

---

## Headless / Hooks API

For developers who want Orb's integration logic but not its visuals:

```js
const { state, volume } = useVoiceOrb({ provider: 'vapi', client })
```

This is a secondary priority but important for flexibility and adoption.

---

## What Orb Is Not

- Not a full voice agent SDK — it doesn't handle audio capture, STT, LLM, or TTS
- Not a chat UI / transcript display (out of scope, at least for v1)
- Not a voice agent backend — purely a frontend visual layer

---

## Success Metrics (qualitative)

- A developer using Vapi/ElevenLabs/Pipecat can add Orb in under 5 minutes
- The sci-fi themes are visually impressive enough to be shared on Twitter/X without context
- Becomes the de-facto standard visual layer for voice agents, the way Shadcn is for general UI

---

## Technical Decisions

| Decision | Choice | Notes |
|---|---|---|
| Animation | CSS + SVG for Tier 0/1/simple sci-fi, Canvas + WebGL for complex sci-fi themes | No Framer Motion dependency |
| Repo structure | Single repo, single package | Can split later if needed |
| Demo site | Yes, ships at launch | Live playground to click through all themes and states |
| License | MIT | |

---

## Package Name

Single package: `orb-ui` (`orb` is taken on npm).

```
npm install orb-ui
```

## Repo Structure

```
orb-ui/
├── src/
│   ├── components/        # VoiceOrb component
│   ├── themes/            # debug, circle, bars, jarvis, ...
│   ├── adapters/          # vapi, elevenlabs, pipecat, bland, custom
│   └── index.ts           # public exports
├── demo/                  # Demo/playground site
└── ...
```

Usage:
```jsx
import { VoiceOrb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'
```

---

## Build Order

1. **`debug` theme** — verify the state/volume API works end to end
2. **Vapi adapter** — first real provider integration, proves the architecture
3. **`circle` + `bars` presets** — utility themes for broad adoption
4. **ElevenLabs, Pipecat, Bland adapters** — follow based on demand
5. **`jarvis` sci-fi theme** — the launch demo, built to go viral
6. **Demo site** — ships at launch alongside jarvis

Deferred:
- Remaining sci-fi themes (hal, glados, pulse)
- Headless hooks API (`useVoiceOrb`)
