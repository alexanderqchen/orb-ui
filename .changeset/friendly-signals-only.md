---
'orb-ui': minor
---

BREAKING: Remove the deprecated callback-object adapter API scheduled for 0.5.0. `Orb` now accepts
only signal-based adapters whose `subscribe(listener)` implementation emits complete `OrbSignal`
objects. The `AdapterCallbacks` and `LegacyOrbAdapter` types are no longer exported.

Migrate callbacks such as `onStateChange(state)` and `onVolumeChange(volume)` to
`listener({ state, inputVolume, outputVolume })` calls. Provider adapters created by orb-ui already
use the signal API and require no changes.
