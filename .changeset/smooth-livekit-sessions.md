---
'orb-ui': minor
---

Add a simplified `orb-ui/adapters/livekit` browser entrypoint. LiveKit users can now provide a token
endpoint and optional agent name while orb-ui owns the Room, TokenSource, audio analysers,
microphone lifecycle, and unique room naming. The existing `orb-ui/adapters` LiveKit factory remains
available for advanced app-owned Room, custom fetcher, raw credential, and runtime override modes.
