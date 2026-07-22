---
'orb-ui': minor
---

Standardize every built-in provider adapter on separate input and output calibration profiles that
map raw levels to a stable 0–1 speech envelope. Add semantic amplitude anchors, elapsed-time
rise/fall processing, diagnostic samples, shipped provider defaults, and a guided playground
calibration runner.

This intentionally removes the ambiguous `volume` prop and `OrbSignal.volume`. Migrate controlled
or custom integrations to `signal.inputVolume` while listening and `signal.outputVolume` while
speaking.
