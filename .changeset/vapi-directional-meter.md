---
'orb-ui': minor
---

Measure Vapi microphone input from the existing SDK-owned audio track so listening responds to
speech. Follow microphone replacement and mute, and clean up the meter without stopping provider
tracks. Add input calibration and diagnostic callbacks while retaining compatibility with clients
that only expose Vapi events. Retune the output profile for continuous SDK levels so ordinary
assistant speech is no longer understated.

Update the demo and SDK compatibility checks to Vapi 2.7.0, replacing its deprecated Daily runtime.
