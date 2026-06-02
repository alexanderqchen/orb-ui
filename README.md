# orb-ui

React voice agent UI components for Vapi, ElevenLabs, and custom realtime voice AI apps. orb-ui gives you animated voice orbs, audio-reactive themes, accessible clickable controls, and provider adapters for building polished voice agent interfaces in React.

<p align="center">
  <a href="https://orb-ui.com">
    <img src="assets/demo-screenshot.jpg" alt="orb-ui demo" width="600" />
  </a>
</p>

<p align="center">
  <a href="https://orb-ui.com">Live Demo</a> · <a href="https://orb-ui.com/docs/guides/voice-agent-ui">Voice Agent UI Guide</a> · <a href="https://www.npmjs.com/package/orb-ui">npm</a> · <a href="https://github.com/alexanderqchen/orb-ui">GitHub</a>
</p>

```jsx
import Vapi from '@vapi-ai/web'
import { Orb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'

const vapi = new Vapi('your-public-key')
const adapter = createVapiAdapter(vapi, { assistantId: 'your-assistant-id' })

export function VoiceOrb() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start voice assistant" />
}
```

## Install

Install the component package:

```bash
npm install orb-ui
```

Provider adapters are lightweight wrappers around provider SDKs. Install the SDK for the provider you use:

```bash
# Vapi
npm install orb-ui @vapi-ai/web

# ElevenLabs Conversational AI
npm install orb-ui @elevenlabs/client
```

> **Note:** Orb uses React hooks internally — in Next.js App Router, use it in a `'use client'` component.

## Quick Start

Use orb-ui as a React voice AI component when you need a Vapi voice UI, an ElevenLabs voice UI, or a custom animated voice orb for another realtime voice agent stack.

### With Vapi

```jsx
import Vapi from '@vapi-ai/web'
import { Orb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'

const vapi = new Vapi('your-public-key')
const adapter = createVapiAdapter(vapi, { assistantId: 'your-assistant-id' })

function App() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start Vapi assistant" />
}
```

### With ElevenLabs

```jsx
import { Conversation } from '@elevenlabs/client'
import { Orb } from 'orb-ui'
import { createElevenLabsAdapter } from 'orb-ui/adapters'

const adapter = createElevenLabsAdapter(Conversation, { agentId: 'your-agent-id' })

function App() {
  return <Orb adapter={adapter} theme="circle" aria-label="Start ElevenLabs assistant" />
}
```

### Controlled mode (custom integration)

```jsx
import { Orb } from 'orb-ui'
import { useState } from 'react'

function App() {
  const [state, setState] = useState('idle')
  const [volume, setVolume] = useState(0)

  return <Orb state={state} volume={volume} theme="circle" />
}
```

## Themes

| Theme    | Description                                                                   |
| -------- | ----------------------------------------------------------------------------- |
| `debug`  | State + volume display with start/stop. Use to verify your integration works. |
| `circle` | Pulsing circle that reacts to volume.                                         |
| `bars`   | Five bars that animate with voice.                                            |

When an adapter or `onStart`/`onStop` handler is provided, `circle` and `bars` render as keyboard-accessible `<button type="button">` controls. Pass an `aria-label` when the surrounding UI does not already label the control.

## Props

| Prop         | Type                            | Default   | Description                                                 |
| ------------ | ------------------------------- | --------- | ----------------------------------------------------------- |
| `theme`      | `'debug' \| 'circle' \| 'bars'` | `'debug'` | Visual theme                                                |
| `state`      | `OrbState`                      | `'idle'`  | Conversation state (controlled mode)                        |
| `volume`     | `number`                        | `0`       | Audio volume, 0–1 (controlled mode)                         |
| `adapter`    | `OrbAdapter`                    | —         | Provider adapter (manages state + volume automatically)     |
| `size`       | `number`                        | `200`     | Size in pixels                                              |
| `className`  | `string`                        | —         | Optional class name for the rendered theme                  |
| `style`      | `React.CSSProperties`           | —         | Optional inline styles for the rendered theme               |
| `disabled`   | `boolean`                       | `false`   | Disables clickable themes and debug start/stop controls     |
| `aria-label` | `string`                        | generated | Accessible label for clickable `circle` and `bars` controls |
| `onStart`    | `() => void`                    | —         | Custom start handler (overrides adapter.start())            |
| `onStop`     | `() => void`                    | —         | Custom stop handler (overrides adapter.stop())              |

## States

`idle` · `connecting` · `listening` · `speaking` · `error`

## Supported Providers

| Provider                                              | Adapter                                                  |
| ----------------------------------------------------- | -------------------------------------------------------- |
| [Vapi](https://vapi.ai)                               | `createVapiAdapter` from `orb-ui/adapters`               |
| [ElevenLabs](https://elevenlabs.io/conversational-ai) | `createElevenLabsAdapter` from `orb-ui/adapters`         |
| Custom                                                | Use controlled mode — pass `state` and `volume` directly |

## Development

```bash
git clone https://github.com/alexanderqchen/orb-ui.git
cd orb-ui
pnpm install

# Build the library
pnpm build

# Run demo locally
pnpm dev:demo
```

Useful maintenance commands:

```bash
pnpm check        # format check, lint, typechecks, tests, library build, demo build
pnpm format       # format repo files
pnpm changeset    # add release notes for a user-facing package change
```

Releases are managed with Changesets. Merging a Changesets version PR publishes
`orb-ui` to npm from GitHub Actions using npm trusted publishing.

## License

MIT © [Alexander Chen](https://github.com/alexanderqchen)
