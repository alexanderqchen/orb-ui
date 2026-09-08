# orb-ui

## 0.8.0

### Breaking changes and migration

- Replace the removed `volume` prop and `OrbSignal.volume` with `inputVolume` for microphone
  activity and `outputVolume` for assistant playback.
- Custom calibration overrides now use `amplitude: { silenceFloor, speechReference, speechPeak }`
  and `envelope: { riseTimeMs, fallTimeMs }` instead of `noiseFloor`, `gain`, `exponent`, `attack`,
  and `release`. Remove old overrides to use the new provider defaults, or capture new anchors
  in the playground. The old per-sample smoothing rates do not directly convert to milliseconds.
- Update imported calibration types from `OutputVolumeCalibration`, `OutputVolumeCalibrationSource`,
  and `OutputVolumeSample` to `VolumeCalibration`, `VolumeCalibrationSource`, and `VolumeSample`.
  `DEFAULT_OUTPUT_VOLUME_CALIBRATION` is replaced by `DEFAULT_VOLUME_CALIBRATION`; use
  `PROVIDER_VOLUME_CALIBRATIONS` for provider-specific defaults. Diagnostic `shaped` is now `mapped`.

See the [component migration guide](https://orb-ui.com/docs/reference/orb-component#migrating-from-volume)
and [adapter migration guide](https://orb-ui.com/docs/adapters/overview#migrating-calibration-overrides-in-080).

### Minor Changes

- 3d4d9ff: Standardize every built-in provider adapter on separate input and output calibration profiles that
  map raw levels to a stable 0–1 speech envelope. Add semantic amplitude anchors, elapsed-time
  rise/fall processing, diagnostic samples, shipped provider defaults, and a guided playground
  calibration runner. Directional envelopes remain continuous across active-state transitions so
  provider mode events cannot force the animation through an artificial zero.

  Retune ElevenLabs input/output, LiveKit output, and Gemini output anchors from live SDK measurements so ordinary
  speech stays closer to the middle of the range. Preserve LiveKit input and Pipecat profiles, which
  already produced suitable levels in the same microphone test. Document repeatable audio QA and
  the distinction between frequency-based SDK meters and waveform RMS.

  Fix Pipecat generation events overriding the speaking animation while earlier audio is still
  playing. Playback retains priority until the bot stops or the user interrupts it.

  Keep Gemini listening when the user interrupts and buffered output chunks arrive before the
  server stops playback. This prevents rapid listening/speaking animation switches during overlap.

  This intentionally removes the ambiguous `volume` prop and `OrbSignal.volume`. Migrate controlled
  or custom integrations to `signal.inputVolume` while listening and `signal.outputVolume` while
  speaking.

- 52ae8f5: Add typed theme configuration objects with `balanced`, `calm`, and `expressive` presets plus
  theme-specific appearance, geometry, and motion overrides. String theme names remain shorthand for
  the balanced preset. Add application-wide defaults through `OrbThemeProvider`, responsive
  `--orb-ui-*` variables, stable semantic slots, replaceable built-in control chrome, and completely
  custom theme renderers that retain Orb's normalized signal and accessible lifecycle contract. Theme
  motion exposes semantic response exponent, activity rise/fall, and state transition timing
  separately from provider volume normalization.

  Keep Cloud animation continuous when changing presets, appearance, or responsive size during an
  active session; those visual updates no longer replay the connection entrance.

- 878b287: Measure Vapi microphone input from the existing SDK-owned audio track so listening responds to
  speech. Follow microphone replacement and mute, and clean up the meter without stopping provider
  tracks. Add input calibration and diagnostic callbacks while retaining compatibility with clients
  that only expose Vapi events. Retune the output profile for continuous SDK levels so ordinary
  assistant speech is no longer understated.

  Update the demo and SDK compatibility checks to Vapi 2.7.0, replacing its deprecated Daily runtime.

### Patch Changes

- 04968a1: Keep OpenAI Realtime playback events authoritative over volume-based state inference. Avoid a
  listening flash before the first playback packet and a false return to speaking as the output
  envelope fades after playback stops. Preserve listening during user interruption and retain
  meter-based fallback for integrations without playback events. Retune output amplitude anchors
  from live measurements so ordinary assistant speech reaches the shared midrange response.

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
