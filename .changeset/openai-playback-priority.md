---
'orb-ui': patch
---

Keep OpenAI Realtime playback events authoritative over volume-based state inference. Avoid a
listening flash before the first playback packet and a false return to speaking as the output
envelope fades after playback stops. Preserve listening during user interruption and retain
meter-based fallback for integrations without playback events. Retune output amplitude anchors
from live measurements so ordinary assistant speech reaches the shared midrange response.
