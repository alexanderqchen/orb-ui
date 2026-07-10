# orb-ui

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
