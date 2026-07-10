# orb-ui Roadmap

This roadmap is public planning, not a promise of dates or exact release contents. It should help contributors understand where the project is headed without exposing private analytics, credentials, or internal notes.

## Near Term

### Signal-based adapter API — complete

The adapter signal model now reports state, input volume, output volume, and errors as one coherent update.

Target direction:

- Add an `OrbSignal` type
- Add a `signal` prop for controlled usage
- Support `inputVolume` and `outputVolume`
- Add a `thinking` voice state
- Document migration from callback-object adapters
- Remove surprising global audio behavior from `Orb`

### LiveKit adapter — complete

First-class LiveKit Agents support includes signal-native state, local microphone and remote agent
volume metering, attached agent audio, and token-source based connection setup. The adapter should
keep browser auth explicit by favoring token endpoints and LiveKit sandbox token servers over raw
pasted participant tokens. The dedicated browser entrypoint owns the standard LiveKit SDK runtime,
token source, and room naming so the normal setup only needs a token endpoint and optional agent
name; advanced app-owned Room modes remain available separately.

### Pipecat adapter — complete

The transport-agnostic Pipecat adapter consumes `PipecatClient` RTVI events and supports Pipecat
Cloud/Daily, self-hosted SmallWebRTC, and custom client transports. It normalizes state and both
audio levels while leaving agent deployment and connection credentials in the application.

### OpenAI Realtime adapter — complete

The OpenAI Realtime adapter owns browser WebRTC, audio playback, input/output metering, and current
GA session events. Server-side client-secret creation stays explicit in user apps.

### Gemini Live adapter — complete

The Gemini Live adapter owns browser microphone PCM streaming, native-audio playback, interruption
handling, and signal normalization. Applications still own the official GenAI client and ephemeral
token creation.

## Experience

### More impressive themes

Add polished themes that feel production-ready, not just minimal examples. Public API names should stay neutral and ownable.

Candidate theme directions:

- `halo`: luminous orb-style assistant presence
- `prism`: colorful layered realtime voice presence
- `studio`: waveform-forward voice interface
- `aurora`: fluid multicolor assistant motion

### Better demo

Make the homepage demo feel like an actual product surface:

- Clickable simulated session
- Live theme switching
- Clear adapter examples
- Better examples for provider and controlled modes

## Ongoing

- Keep docs search-friendly and implementation-honest
- Keep adapter code dependency-light
- Keep animations accessible, performant, and responsive
- Prefer small provider-specific adapters over one opaque universal client
