---
'orb-ui': minor
---

Standardize every built-in provider adapter on separate input and output calibration profiles that
map raw levels to a stable 0–1 speech envelope. Add semantic amplitude anchors, elapsed-time
rise/fall processing, diagnostic samples, shipped provider defaults, and a guided playground
calibration runner. Directional envelopes remain continuous across active-state transitions so
provider mode events cannot force the animation through an artificial zero.

Retune ElevenLabs input/output and LiveKit output anchors from live SDK measurements so ordinary
speech stays closer to the middle of the range. Preserve LiveKit input and Pipecat profiles, which
already produced suitable levels in the same microphone test. Document repeatable audio QA and
the distinction between frequency-based SDK meters and waveform RMS.

Fix Pipecat generation events overriding the speaking animation while earlier audio is still
playing. Playback retains priority until the bot stops or the user interrupts it.

This intentionally removes the ambiguous `volume` prop and `OrbSignal.volume`. Migrate controlled
or custom integrations to `signal.inputVolume` while listening and `signal.outputVolume` while
speaking.
