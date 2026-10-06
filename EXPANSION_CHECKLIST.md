# Voice integration and recipe expansion

All fifteen additions have implementation, setup instructions, a copyable typed example, and a
canonical page with an embedded local simulation. The seven new integration exports are available
in `orb-ui@0.10.0` and later. Live credential-based provider tests have not been run; simulated
previews do not establish live provider reliability.

## Integrations

| Addition                | Implementation and coverage                                                                                                           | Canonical page                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Retell WebCall          | Current session status/audio events; PCM speaking estimate; controlled application turn observer; stale session and shutdown fixtures | [Retell](docs/adapters/retell.mdx)          |
| Hume EVI                | Observe an existing VoiceProvider/useVoice session and FFT values without a second microphone or player                               | [Hume](docs/adapters/hume.mdx)              |
| Deepgram Voice Agent    | Browser SDK adapter and controlled React provider bridge; microphone/player ownership, interruption and cleanup fixtures              | [Deepgram](docs/adapters/deepgram.mdx)      |
| Agora Conversational AI | Toolkit events and existing RTC tracks; application-owned authorization, audio and agent teardown                                     | [Agora](docs/adapters/agora.mdx)            |
| Azure Voice Live        | Typed JavaScript session events; PCM worklet capture/playback, generation gaps, interruption and audio suspension handling            | [Azure](docs/adapters/azure-voice-live.mdx) |
| Cartesia Managed Agents | Managed Line WebSocket protocol; scoped token callback, format negotiation, PCM playback, backpressure and reconnect fixtures         | [Cartesia](docs/adapters/cartesia.mdx)      |
| Amazon Nova 2 Sonic     | Controlled browser bridge plus complete Node/Socket.IO/Bedrock recipe; synthetic transport, token/origin and bounded-shutdown tests   | [Nova](docs/adapters/nova-sonic.mdx)        |

SDK versions and official references appear on each integration page. SDK declarations are used
by `pnpm typecheck:examples`; provider SDKs are not bundled as orb-ui runtime dependencies.
Retell playback-based speech is an estimate, and thinking/interruption require an application
turn observer. Hume observes an existing session. Azure browser access requires the developer's
own authenticated principal. Nova is a fullstack recipe with AWS credentials confined to Node.

## React recipes

| Addition                 | Implemented behavior                                                                                                 | Canonical page                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Push-to-talk composer    | Pointer and keyboard hold, editable transcript, cancel/retry and explicit local message submission                   | [Composer](docs/recipes/push-to-talk.mdx)               |
| Voice form               | Editable booking fields, review/readback, confirmation and repeated-click protection                                 | [Form](docs/recipes/voice-form.mdx)                     |
| Voice document Q&A       | Local document retrieval, linked source citations, no-match answers and failure/retry                                | [Document Q&A](docs/recipes/document-qa.mdx)            |
| Voice-guided onboarding  | Step progress, reviewed tool effects, failure/retry and snapshot undo                                                | [Onboarding](docs/recipes/guided-onboarding.mdx)        |
| Language practice        | Editable attempt, transparent local corrections, corrected-phrase repeat and retry                                   | [Language practice](docs/recipes/language-practice.mdx) |
| Interview rehearsal      | Transparent story checklist, question/attempt progress, save guards and same-question retry                          | [Interview](docs/recipes/interview-rehearsal.mdx)       |
| Spoken product search    | Editable query, reviewed filters, matching fictional product cards, manual refinement and undo                       | [Product search](docs/recipes/product-search.mdx)       |
| Audio-reactive narration | Committed local speech WAV, measured output level, audio-clock transcript highlighting, pause/seek/reset and cleanup | [Narration](docs/recipes/audio-narration.mdx)           |

Each recipe's downloadable TSX is the exact component used by its preview. Recipe setup needs no
provider account. The narration page also supplies its committed WAV fixture. CSS class names
are optional hooks for an application's own styles.

## Verification and publication boundary

Run `pnpm check` for formatting, lint, source and SDK types, unit fixtures, the built package,
demo types/build, the standalone Nova offline checks, and local Chrome browser tests.
The Nova package's `npm run test:browser` additionally exercises its simulated socket server.
The expansion browser suite accepts `ORB_PREVIEW_URL` and an optional temporary
`ORB_PREVIEW_ACCESS_URL` to repeat the same checks on a protected review deployment; traces are
disabled for that authenticated run.

Browser coverage includes start/stop, interruption, reconnect, errors, repeated clicks,
navigation/back, recipe switching/unmount, mobile layout and keyboard controls. No live provider
credentials are used. Public demos only use simulated states, authored local data and committed
audio. Public provider proxy functions reject requests before reading a body or calling upstream.
Local developer tools require loopback access and developer-owned credentials.

The fifteen content pages share one canonical URL each. Embedded demo routes are noindex, and
the expansion sitemap lists content pages only. No provider-by-recipe page matrix is generated.
Review deployment and draft PR creation are authorized; merging, production publishing and npm
release require approval.
