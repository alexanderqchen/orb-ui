# STATUS.md — orb-ui Project State

> **For agents:** Read this file before touching anything. It tells you what exists,
> what's implemented vs stubbed, what the decisions were, and what to build next.
> The canonical design spec is in `REQUIREMENTS.md`.

---

## What This Is

`orb-ui` is an open-source React component library that provides an animated visual
UI layer for voice AI agents. Single component (`<VoiceOrb>`), pluggable themes,
pluggable provider adapters. MIT license.

**Owner:** Alexander Chen ([@alexanderqchen](https://github.com/alexanderqchen))
**npm:** `orb-ui` (not yet published)
**Repo:** `github.com/alexanderqchen/orb-ui` (not yet pushed to GitHub)

---

## Current Build Status

| Item | Status | Notes |
|---|---|---|
| Repo scaffold | ✅ Done | `package.json`, `tsconfig.json`, `vite.config.ts`, `src/` structure |
| `VoiceOrb` component | ✅ Done | `src/components/VoiceOrb/VoiceOrb.tsx` — controlled + adapter modes |
| `debug` theme | ✅ Done | Fully implemented. State display, volume bar, state buttons, Start/Stop |
| Vapi adapter | ✅ Done | Full event mapping with thinking-state inference |
| `circle` theme | 🚧 Stub | Placeholder renders a static gray circle with "circle (todo)" label |
| `bars` theme | 🚧 Stub | Placeholder renders three static bars |
| `jarvis` theme | 🚧 Stub | Placeholder renders a static sci-fi placeholder |
| ElevenLabs adapter | 🚧 Stub | Shell with full TODO comments and event mapping notes |
| Pipecat adapter | 🚧 Stub | Shell with TODO |
| Bland adapter | 🚧 Stub | Shell with TODO |
| Demo app | 🚧 Scaffolded | `demo/` exists but needs real content wired up |
| README | ✅ Done | Human-readable docs, API reference, theme/adapter tables |
| npm publish | ❌ Not done | — |
| GitHub push | ❌ Not done | Repo exists locally, not pushed yet |

---

## Build Order (what to do next, in order)

1. **`circle` theme** — Simple CSS circle. Pulse on idle, scale+glow on speaking/listening, rotate-dash on thinking.
2. **`bars` theme** — Three vertical bars, animate height/opacity with volume.
3. **ElevenLabs adapter** — `onModeChange({ mode })` maps to speaking/listening; infer thinking from mode gap.
4. **Pipecat adapter** — WebRTC-based; map `botStartedSpeaking` / `botStoppedSpeaking` / `userStartedSpeaking`.
5. **Bland adapter** — Bland uses WebSocket events; map similarly.
6. **`jarvis` theme** — Sci-fi HUD. Canvas + WebGL. This is the launch demo — needs to be stunning.
7. **Demo site** — Interactive playground showing all themes + adapters. This is the marketing page.
8. **Push to GitHub, publish to npm** — Public launch.

---

## File Map

```
orb-ui/
├── src/
│   ├── components/
│   │   └── VoiceOrb/
│   │       ├── VoiceOrb.tsx          # Main component (controlled + adapter logic)
│   │       ├── VoiceOrb.types.ts     # OrbState, OrbTheme, OrbAdapter, VoiceOrbProps
│   │       └── index.ts
│   ├── themes/
│   │   ├── debug/DebugTheme.tsx      # ✅ Fully implemented
│   │   ├── circle/CircleTheme.tsx    # 🚧 Stub
│   │   ├── bars/BarsTheme.tsx        # 🚧 Stub
│   │   ├── jarvis/JarvisTheme.tsx    # 🚧 Stub (Canvas/WebGL target)
│   │   └── index.ts
│   ├── adapters/
│   │   ├── types.ts                  # OrbAdapter interface, AdapterCallbacks
│   │   ├── index.ts                  # Re-exports all createXxxAdapter functions
│   │   ├── vapi/index.ts             # ✅ Fully implemented
│   │   ├── elevenlabs/index.ts       # 🚧 Stub
│   │   ├── pipecat/index.ts          # 🚧 Stub
│   │   └── bland/index.ts            # 🚧 Stub
│   └── index.ts                      # Public API: exports VoiceOrb + types
├── demo/                             # 🚧 Vite app — interactive playground
├── REQUIREMENTS.md                   # Full design spec and decisions
├── STATUS.md                         # ← you are here
├── README.md                         # Human-facing docs (npm / GitHub)
├── package.json                      # name: orb-ui, version: 0.1.0
├── tsconfig.json
└── vite.config.ts                    # Library mode build
```

---

## Core API (do not change without good reason)

```tsx
import { VoiceOrb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'

// Adapter mode (recommended)
<VoiceOrb adapter={createVapiAdapter(vapiClient)} theme="jarvis" />

// Controlled mode (custom integrations)
<VoiceOrb state="listening" volume={0.7} theme="circle" />
```

### OrbState union
```ts
type OrbState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error' | 'disconnected'
```

### OrbAdapter interface
```ts
interface OrbAdapter {
  subscribe(callbacks: {
    onStateChange: (state: OrbState) => void
    onVolumeChange: (volume: number) => void  // normalized 0–1
  }): () => void  // returns unsubscribe fn
}
```

---

## Key Decisions (don't re-debate these)

- **Single package, no monorepo** — `orb-ui` ships everything. Adapters are at `orb-ui/adapters`. Can split later.
- **No Framer Motion** — CSS + SVG for simple themes; Canvas/WebGL for jarvis. Keep bundle small.
- **Peer deps only for React** — Adapters use structural typing, not imports, so `@vapi-ai/web` etc. are never installed by orb-ui.
- **debug theme first** — Ships as Tier 0 so developers can integrate and test before pretty themes exist.
- **jarvis is the launch hero** — It's the sci-fi theme that makes the demo page go viral. Do it last so it's polished.
- **Volume is normalized 0–1** — All adapters must normalize before calling `onVolumeChange`.
- **Controlled props override adapter** — If both `state` prop and `adapter` are provided, the prop wins.
- **`thinking` state inference** — Vapi doesn't emit a thinking event; infer it from final user transcript. Other adapters may need similar patterns.
- **`connecting` state** — Vapi doesn't emit a connecting event either. The Vapi adapter intercepts `vapi.start()` to emit `'connecting'` immediately, then restores the original on unsubscribe. Other adapters should do the same.

---

## Development Commands

```bash
npm run build       # Build the library (tsc + vite)
npm run typecheck   # Type-check only, no emit
npm run dev         # Watch mode build
npm run test        # Vitest
cd demo && npm run dev  # Run interactive demo
```

---

## Git Log (as of last update)

```
8c93595  Implement Vapi adapter with full event mapping and thinking state inference
61b8d8b  Initial scaffold: VoiceOrb component, debug theme, adapter stubs, demo app
```

*Last updated: 2026-02-26*
