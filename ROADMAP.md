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
- Document migration from callback-object adapters — complete
- Remove callback-object adapter compatibility in 0.5.0 — complete
- Remove surprising global audio behavior from `Orb`

### LiveKit adapter — complete

First-class LiveKit Agents support includes signal-native state, local microphone and remote agent
volume metering, attached agent audio, and token-source based connection setup. The adapter should
keep browser auth explicit by favoring token endpoints and LiveKit sandbox token servers over raw
pasted participant tokens. The dedicated browser entrypoint owns the standard LiveKit SDK runtime,
token source, and room naming so the normal setup only needs a token endpoint and optional agent
name; advanced app-owned Room modes remain available separately. Speech-oriented analyser ranges
and output calibration hooks keep the normalized signal dynamic across normal agent voices.

### Pipecat adapter — complete

The transport-agnostic Pipecat adapter consumes `PipecatClient` RTVI events and supports Pipecat
Cloud/Daily, self-hosted SmallWebRTC, and custom client transports. It normalizes state and both
audio levels while leaving agent deployment and connection credentials in the application. Direct
browser-track metering fills gaps when a transport does not emit frequent RTVI audio-level events.

### OpenAI Realtime adapter — complete

The OpenAI Realtime adapter owns browser WebRTC, audio playback, input/output metering, and current
GA session events. Server-side client-secret creation stays explicit in user apps.

### Gemini Live adapter — complete

The Gemini Live adapter owns browser microphone PCM streaming, native-audio playback, interruption
handling, and signal normalization. Applications still own the official GenAI client and ephemeral
token creation.

### SEO and documentation foundations — complete

Canonical documentation routes now own provider, example, and implementation-guide content. The
site uses one sitemap index for the homepage and documentation sitemap, redirects legacy static
HTML routes to their maintained equivalents, and links directly from the homepage to provider and
use-case guides. Documentation pages use one descriptive page heading and implementation-focused
content that stays aligned with the public API.

## Experience

### More impressive themes

Add polished themes that feel production-ready, not just minimal examples. Public API names should stay neutral and ownable.

Completed direction:

- `radial`: four-lobe aqua and cobalt field with a volume-reactive outer membrane for human input,
  independent angular deformation for agent output, and a dedicated phone control
- `cloud`: atmospheric blue-violet sphere with a solid-dot-to-fluid connection entrance,
  state-paced internal cloud motion, opposing input/output volume response, and passive
  external-control support

Before naming another public theme, validate the visual direction against direct product UI research
and a concrete interaction reference.

### Better demo — complete

The homepage now presents orb-ui as a complete product surface instead of a loose collection of
controls:

- Live simulated and manual session modes
- Theme, state, and audio-level controls
- Provider-specific integration examples with copyable code
- Clear provider and controlled-mode paths
- An editorial documentation directory for deeper implementation guidance

### Theme- and direction-aware calibration — future

Provider adapters currently normalize audio into a portable `OrbSignal`, but one provider-wide
curve cannot guarantee the same perceived motion across themes. Theme geometry and animation range
change how a normalized level feels, while human input and agent output can also need different
response profiles.

Future calibration work should explore:

- Independent input and output calibration profiles
- Theme-level response mapping or presets layered on top of provider normalization
- A playground matrix for comparing each provider, theme, and speaking direction
- Keeping provider-specific measurement details out of theme implementations

## Ongoing

- Keep docs search-friendly and implementation-honest
- Keep adapter code dependency-light
- Keep animations accessible, performant, and responsive
- Prefer small provider-specific adapters over one opaque universal client
