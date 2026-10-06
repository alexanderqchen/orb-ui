# Amazon Nova 2 Sonic + orb-ui

A local fullstack Node/Socket.IO-to-Bedrock recipe, with React audio capture and playback.
The default mode streams an authored transcript and a synthetic tone. It makes no AWS calls
and does not request microphone permission. No provider endpoint is deployed with Orb's public demo.

## Start the simulated recipe

Use Node 22.12 or newer, and run these commands from a checkout containing this example:

```bash
# In the orb-ui repository root, build this candidate's bridge exports first.
pnpm install
pnpm build
cd examples/nova-sonic
npm install --ignore-scripts
npm run typecheck
npm test
npm run build
NOVA_ENABLE_LIVE=0 npm run server
```

In a second terminal, run `npm run dev` from this directory. Open `http://127.0.0.1:5174`.
Start, interrupt, replay the local tone, simulate a transport error, stop, and start again.
Do not use `localhost` interchangeably: Origin and backend Host are checked exactly. Vite proxies
the local `/api/nova-session` and `/socket.io` requests to `127.0.0.1:3001`.

`orb-ui` is a local `file:../..` dependency so the example uses this checkout's unpublished bridge.
If distributing the example outside the checkout, include the matching built orb-ui package;
an older installed orb-ui release may not export `createNovaSonicBridge`.

## Optional live mode

Only if you already have authorized credentials and model access, restart your own server with:

```bash
NOVA_ENABLE_LIVE=1 AWS_REGION=us-east-1 npm run server
```

The default AWS credential chain runs on Node only. No provider credential is accepted from
the browser. The browser receives a random, 60-second, single-use application token for one
connection to the fixed `amazon.nova-2-sonic-v1:0` model. This is not an AWS credential.
The backend binds to loopback, permits one active local connection, validates origin/host/input,
and closes sessions after five minutes. Live sessions bill your own AWS account. This local
recipe must not be deployed as an anonymous owner-funded provider proxy.

Microphone permission succeeds before the server starts Bedrock. Capture uses an AudioWorklet
to resample the actual browser rate to 16 kHz PCM16 little-endian mono in 32 ms frames.
Output uses the provider-declared PCM rate, normally 24 kHz. Socket acknowledgments correspond
to input-iterator consumption by the AWS SDK, not a semantic acknowledgment from the model.
The capture queue and playback schedule are bounded, and errors abort the session.

## Files and ownership

| File                    | Responsibility                                                              |
| ----------------------- | --------------------------------------------------------------------------- |
| `server.ts`             | Loopback HTTP token endpoint, single-use authorization, Socket.IO lifecycle |
| `bedrock.ts`            | Real AWS SDK command, bounded input iterator, startup/stop/abort ordering   |
| `protocol.ts`           | Typed transport contract and runtime parsing of model-specific JSON         |
| `browser-session.ts`    | Permission, socket, capture, stop/error/restart and unmount cleanup         |
| `public/pcm-capture.js` | Stateful AudioWorklet PCM conversion                                        |
| `audio.ts`              | Sample-rate-aware PCM player, metering, interruption and queue clearing     |
| `simulated.ts`          | Authored synthetic provider events and quiet tone fixture                   |
| `main.tsx`              | Accessible React controls and final-transcript view                         |

The controlled Orb bridge observes these resources. It owns neither a microphone nor a provider
connection. Output JSON uses `contentId`; input events use `contentName`. `FINAL` transcript blocks
are combined by content ID; `SPECULATIVE` planned text is excluded. Provider completion waits for
queued audio to drain. An `INTERRUPTED` content end clears current/queued output immediately and
blocks late chunks of that audio content.

## Offline verification

```bash
npm run typecheck
npm test
npm run build
```

The 14 offline example tests use the real published AWS and Socket.IO declarations, synthetic
AWS envelopes, loopback transport, and mock Web Audio nodes. They cover lifecycle event order,
bounded input, graceful shutdown, startup abort, an abort-ignored output iterator deadline,
origin and token reuse checks, PCM validation, rate conversion and playback interruption.
The library bridge has another five focused state/transcript/stale-session tests in the root suite.

For reproducible Chrome lifecycle and mobile QA, leave the simulated servers running and run:

```bash
npm run test:browser
```

This uses an already-installed Google Chrome, verifies that every request stays local, and checks
start, stop, interruption, repeated restart, a connection error, keyboard Enter, navigation/back
and a 390 px viewport. It also covers synthetic microphone denial and releasing a permission result
after stop, before any provider socket opens. Screenshots go to `outputs/`.

Live credential tests have **not** been run. No tool execution, automatic session continuation,
telephony, persisted history, or production deployment is claimed. A live application requires its
own authenticated backend and explicit per-user usage/payment policy.

## Official sources (checked October 6, 2026)

- [AWS Nova 2 Sonic examples](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-code-examples.html)
- [AWS Node/browser sample](https://github.com/aws-samples/amazon-nova-samples/tree/main/speech-to-speech/amazon-nova-2-sonic/sample-codes/websocket-nodejs)
- [Input events](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-input-events.html)
- [Output events](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-output-events.html)
- [Barge-in](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-barge-in.html)

Pinned provider dependencies: `@aws-sdk/client-bedrock-runtime@3.1146.0`,
`@smithy/node-http-handler@4.12.1`, `socket.io@4.8.4`, `socket.io-client@4.8.4`.
