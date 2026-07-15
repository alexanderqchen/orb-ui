# orb-ui

## 0.7.0

### Minor Changes

- aec63a7: Add the `radial` WebGL theme with a traveling input-reactive membrane, bidirectional radial motion, and an optional phone-style session control with a configurable surround color.

## 0.6.1

### Patch Changes

- 333bbf1: Keep LiveKit output volume dynamic with speech-oriented analyser settings and provider-tested calibration. Add Pipecat media-track metering so input and output volume remain available when transport audio-level events are missing or sparse, with provider-tested defaults and live-tunable output calibration hooks for both adapters.

## 0.6.0

### Minor Changes

- 90a7e96: Add the atmospheric `cloud` theme with a solid-dot-to-fluid entrance, state-paced cloud motion, and opposing input/output volume response. Support passive adapter-backed visuals with external session controls through `interactive={false}`.

## 0.5.0

### Minor Changes

- f8f04d6: BREAKING: Remove the deprecated callback-object adapter API scheduled for 0.5.0. `Orb` now accepts
  only signal-based adapters whose `subscribe(listener)` implementation emits complete `OrbSignal`
  objects. The `AdapterCallbacks` and `LegacyOrbAdapter` types are no longer exported.

  Migrate callbacks such as `onStateChange(state)` and `onVolumeChange(volume)` to
  `listener({ state, inputVolume, outputVolume })` calls. Provider adapters created by orb-ui already
  use the signal API and require no changes.

- e246f90: Add a simplified `orb-ui/adapters/livekit` browser entrypoint. LiveKit users can now provide a token
  endpoint and optional agent name while orb-ui owns the Room, TokenSource, audio analysers,
  microphone lifecycle, and unique room naming. The existing `orb-ui/adapters` LiveKit factory remains
  available for advanced app-owned Room, custom fetcher, raw credential, and runtime override modes.

## 0.4.0

### Minor Changes

- a85193b: Add signal-native Pipecat, OpenAI Realtime, and Gemini Live adapters. The new adapters support
  Pipecat Cloud and self-hosted transports, OpenAI's GA browser WebRTC flow, Gemini native-audio Live
  sessions, separate input/output metering, managed playback, and documented short-lived credential
  patterns. OpenAI Realtime and Gemini Live also support live output calibration hooks, and the
  provider playground exposes gain, curve, noise-floor, attack, and release controls with raw level
  diagnostics for tuning without reconnecting an active session. Gemini Live uses explicit activity
  markers by default for deterministic voice turn detection when server-side VAD is disabled. OpenAI
  Realtime and Gemini Live use their validated playground calibrations as default output curves.

## 0.3.0

### Minor Changes

- a168197: Add `createLiveKitAdapter` for LiveKit Agents. The adapter supports token endpoint, LiveKit
  `TokenSource`, raw credential, and app-managed room flows, plus LiveKit agent state attributes,
  attached remote agent audio, and normalized local input and remote output volume for orb-ui themes.
- 46cbbfc: BREAKING: introduce the signal-based adapter API.

  Adapters should now call `listener({ state, inputVolume, outputVolume })` from `subscribe(listener)` instead of using separate `onStateChange` and `onVolumeChange` callbacks. The `Orb` component now also accepts a controlled `signal` prop for integrations with separate input and output volume levels.

  Legacy callback-object adapters still work with a deprecation warning and are planned for removal in `0.5.0`.

## 0.2.4

### Patch Changes

- d3759d7: Improve package type exports, provider adapter examples, ElevenLabs adapter typing, and clickable Orb accessibility.
