# orb-ui

Beautiful animated UI components for voice AI agents. Add a stunning visual layer to your voice agent in 2 lines of code.

```jsx
import { VoiceOrb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'

<VoiceOrb adapter={createVapiAdapter(vapiClient)} theme="jarvis" />
```

## Install

```bash
npm install orb-ui
```

## Quick Start

### With a provider adapter

```jsx
import Vapi from '@vapi-ai/web'
import { VoiceOrb } from 'orb-ui'
import { createVapiAdapter } from 'orb-ui/adapters'

const vapi = new Vapi('your-public-key')

function App() {
  return <VoiceOrb adapter={createVapiAdapter(vapi)} theme="jarvis" />
}
```

### Controlled mode (custom integration)

```jsx
import { VoiceOrb } from 'orb-ui'

function App() {
  const [state, setState] = useState('idle')
  const [volume, setVolume] = useState(0)

  // Wire up your own voice SDK here...

  return <VoiceOrb state={state} volume={volume} theme="circle" />
}
```

### Debug mode (verify your integration)

```jsx
// Default theme is 'debug' — use it to confirm state and volume are wired up correctly
<VoiceOrb
  adapter={createVapiAdapter(vapi)}
  onStart={() => vapi.start(assistantId)}
  onStop={() => vapi.stop()}
/>
```

## Themes

| Theme | Description | Status |
|---|---|---|
| `debug` | Text display of state + volume. Start/Stop buttons. Use to verify your integration. | ✅ Ready |
| `circle` | Pulsing circle that reacts to volume. | 🚧 Coming soon |
| `bars` | Three bars that animate with voice volume. | 🚧 Coming soon |
| `jarvis` | Sci-fi HUD with rotating rings, arc segments, and scanning lines. | 🚧 Coming soon |

## Supported Providers

| Provider | Package | Status |
|---|---|---|
| [Vapi](https://vapi.ai) | `@vapi-ai/web` | ✅ Ready |
| [ElevenLabs](https://elevenlabs.io/conversational-ai) | `@elevenlabs/client` | 🚧 Coming soon |
| [Pipecat](https://pipecat.ai) | `@pipecat-ai/client-js` | 🚧 Coming soon |
| [Bland](https://bland.ai) | — | 🚧 Coming soon |
| Custom | — | ✅ Use controlled mode |

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `theme` | `'debug' \| 'circle' \| 'bars' \| 'jarvis'` | `'debug'` | Visual theme |
| `state` | `OrbState` | `'idle'` | Current conversation state (controlled mode) |
| `volume` | `number` | `0` | Audio volume, 0–1 (controlled mode) |
| `adapter` | `OrbAdapter` | — | Provider adapter (auto-manages state + volume) |
| `size` | `number` | `200` | Size in pixels |
| `onStart` | `() => void` | — | Called when Start is clicked (debug theme) |
| `onStop` | `() => void` | — | Called when Stop is clicked (debug theme) |

## States

| State | When |
|---|---|
| `idle` | No active session |
| `connecting` | Session being established |
| `listening` | User's turn — receiving mic input |
| `thinking` | AI processing — awaiting response |
| `speaking` | AI's turn — producing audio |
| `error` | Something went wrong |
| `disconnected` | Session ended |

## Development

```bash
# Install dependencies
npm install
cd demo && npm install && cd ..

# Run demo locally
cd demo && npm run dev

# Build the library
npm run build

# Type check
npm run typecheck
```

## Contributing

See [`STATUS.md`](./STATUS.md) for current build status, file map, what's implemented vs stubbed, and what to work on next.

See [`REQUIREMENTS.md`](./REQUIREMENTS.md) for the full design spec and architecture decisions.

## License

MIT © [Alexander Chen](https://github.com/alexanderqchen)
