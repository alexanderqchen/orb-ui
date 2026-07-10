---
'orb-ui': minor
---

Add signal-native Pipecat, OpenAI Realtime, and Gemini Live adapters. The new adapters support
Pipecat Cloud and self-hosted transports, OpenAI's GA browser WebRTC flow, Gemini native-audio Live
sessions, separate input/output metering, managed playback, and documented short-lived credential
patterns. OpenAI Realtime and Gemini Live also support live output calibration hooks, and the
provider playground exposes gain, curve, noise-floor, attack, and release controls with raw level
diagnostics for tuning without reconnecting an active session. Gemini Live uses explicit activity
markers by default for deterministic voice turn detection when server-side VAD is disabled. OpenAI
Realtime and Gemini Live use their validated playground calibrations as default output curves.
