# orb-ui Roadmap

This roadmap is public planning, not a promise of dates or exact release contents. It should help contributors understand where the project is headed without exposing private analytics, credentials, or internal notes.

## Near Term

### Signal-based adapter API

Introduce a richer adapter signal model so providers can report state, input volume, output volume, and errors as one coherent update.

Target direction:

- Add an `OrbSignal` type
- Add a `signal` prop for controlled usage
- Support `inputVolume` and `outputVolume`
- Add a `thinking` voice state
- Document migration from callback-object adapters
- Remove surprising global audio behavior from `Orb`

### OpenAI Realtime adapter

Add first-class OpenAI Realtime support after the signal API lands. The initial adapter should focus on browser voice UI use cases and keep server-side token/session creation explicit in user apps.

### Gemini Live adapter

Add Gemini Live support after the OpenAI Realtime adapter or in parallel if the signal API is ready. The adapter should normalize Live API session state and audio levels while keeping the underlying session setup understandable.

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
