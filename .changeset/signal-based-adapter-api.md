---
'orb-ui': minor
---

BREAKING: introduce the signal-based adapter API.

Adapters should now call `listener({ state, inputVolume, outputVolume })` from `subscribe(listener)` instead of using separate `onStateChange` and `onVolumeChange` callbacks. The `Orb` component now also accepts a controlled `signal` prop for integrations with separate input and output volume levels.

Legacy callback-object adapters still work with a deprecation warning and are planned for removal in `0.5.0`.
