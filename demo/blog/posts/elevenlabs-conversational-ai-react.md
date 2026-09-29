---
title: 'Build an ElevenLabs Conversational AI Agent in React'
description: Build a React voice agent with ElevenLabs, a server-side conversation-token endpoint, WebRTC, transcript events, interruption handling, and safe session cleanup.
date: '2026-09-28'
category: Tutorial
---

**An ElevenLabs conversational AI app needs an agent, a server endpoint that issues a short-lived session credential, and a browser client that owns the microphone session.** This tutorial builds all three boundaries with React, Vite, Express, and the ElevenLabs JavaScript SDK.

The result has Start and Stop controls, connection and speaking status, a live text-event feed, and cleanup when the component unmounts. It uses a private agent and explicitly selects WebRTC. The standard ElevenLabs API key stays on your server.

Sources checked **September 28, 2026**. The example targets `@elevenlabs/client@1.9.0`. Its code is checked against that SDK and its lifecycle is tested with a simulated provider; an authenticated, billed ElevenLabs conversation has not been verified for this article. Run the final microphone and agent checks with your own account before deploying it.

## How the connection works

```text
React → your POST /api/conversation-token → ElevenLabs token endpoint
React + conversation token → ElevenLabs WebRTC session
```

Your backend uses the standard API key and a fixed agent ID to request a conversation token. The browser receives only the conversation token. Treat that token as a credential too: keep it in memory and avoid logging or persisting it.

ElevenLabs also supports signed URLs for WebSocket sessions. They are a different credential path: use `signedUrl` with `connectionType: 'websocket'`, or `conversationToken` with `connectionType: 'webrtc'`. This example uses the latter.

## 1. Create and configure an agent

Create an agent in the [ElevenLabs dashboard](https://elevenlabs.io/app/conversational-ai). Choose a voice and language model, set a short first message, and give it a simple system prompt. For a first test, use an agent that answers questions about a small topic and has no tools with external side effects.

Enable authentication for the agent and copy its agent ID. Create a server API key with the permissions required to obtain conversation tokens. Configure allowed domains for your intended deployment where applicable; domain restrictions do not replace authentication in your application.

In the agent's Advanced settings, enable the client events used by the interface, including user transcripts, agent responses, and interruptions. Review the turn-taking and interruption settings for the behavior you want. If speech works but text events do not arrive, inspect these settings first.

## 2. Create the React application

Use Node.js 22.12 or newer and run:

```bash
npm create vite@latest elevenlabs-react-agent -- --template react-ts
cd elevenlabs-react-agent
npm install
npm install @elevenlabs/client@1.9.0 express
```

Append `.env` to `.gitignore`. Create `.env` at the project root:

```dotenv
ELEVENLABS_API_KEY=replace_with_your_server_key
ELEVENLABS_AGENT_ID=replace_with_your_private_agent_id
```

Do not prefix these variables with `VITE_`: Vite exposes variables with that prefix to browser code.

## 3. Add a local conversation-token server

Create `server.mjs` in the project root:

```js
import express from 'express'

const apiKey = process.env.ELEVENLABS_API_KEY
const agentId = process.env.ELEVENLABS_AGENT_ID
if (!apiKey || !agentId) throw new Error('Set both ElevenLabs environment variables')

const app = express()
app.post('/api/conversation-token', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  // This server is for the local tutorial only. Reject other browser origins.
  if (req.get('origin') !== 'http://localhost:5173') {
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  try {
    const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/token')
    url.searchParams.set('agent_id', agentId)
    const upstream = await fetch(url, {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) throw new Error('Token request failed')
    const body = await upstream.json()
    if (typeof body.token !== 'string' || !body.token) {
      throw new Error('Missing conversation token')
    }
    return res.json({ token: body.token })
  } catch {
    // Do not forward provider responses or credentials to the browser.
    return res.status(502).json({ error: 'Unable to start a conversation' })
  }
})

app.listen(3001, '127.0.0.1', () => {
  console.log('Local token server listening on port 3001')
})
```

The server fixes the agent ID rather than accepting an arbitrary agent from the browser. It binds only to loopback and rejects requests from other browser origins. This is a local example, **not a public authentication system**. Before exposing the endpoint, require your application's authenticated session, authorize access to the agent, and enforce per-user usage limits.

Replace `vite.config.ts` with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
})
```

The browser uses `/api/conversation-token` on its own origin; Vite proxies it to Express during development. Production needs an equivalent route to your deployed backend.

## 4. Own one voice session at a time

Create `src/voice.ts`. Keeping the session controller outside React makes startup, cancellation, and cleanup explicit:

```ts
import { Conversation } from '@elevenlabs/client'

type Session = Awaited<ReturnType<typeof Conversation.startSession>>
type Phase = 'idle' | 'connecting' | 'connected' | 'stopping'
type Events = {
  phase: (value: Phase) => void
  mode: (value: 'speaking' | 'listening') => void
  message: (value: string) => void
  error: (value: string) => void
}
type Attempt = {
  cancelled: boolean
  ended: boolean
  starting: boolean
  abort: AbortController
  session?: Session
}

export function createVoice(events: Events) {
  let current: Attempt | undefined
  const live = (attempt: Attempt) => current === attempt && !attempt.cancelled
  const finish = (attempt: Attempt) => {
    if (current !== attempt) return
    current = undefined
    events.phase('idle')
  }
  const end = async (session: Session) => {
    try {
      await session.endSession()
    } catch {
      events.error('Could not confirm session cleanup. Reload before reconnecting.')
      // Keep the controller locked if cleanup could not be confirmed.
      throw new Error('Session cleanup failed')
    }
  }

  return {
    async start() {
      if (current) return
      const attempt: Attempt = {
        cancelled: false,
        ended: false,
        starting: true,
        abort: new AbortController(),
      }
      current = attempt
      events.error('')
      events.phase('connecting')
      try {
        const response = await fetch('/api/conversation-token', {
          method: 'POST',
          signal: attempt.abort.signal,
        })
        if (!response.ok) throw new Error('Unable to obtain a conversation token')
        const { token } = await response.json()
        if (typeof token !== 'string' || !token) throw new Error('Invalid token response')
        if (!live(attempt)) return
        const session = await Conversation.startSession({
          conversationToken: token,
          connectionType: 'webrtc',
          onMessage: ({ role, message }) => {
            if (live(attempt)) events.message(`${role}: ${message}`)
          },
          onModeChange: ({ mode }) => {
            if (live(attempt)) events.mode(mode)
          },
          onInterruption: () => {
            if (live(attempt)) events.mode('listening')
          },
          onError: (message) => {
            if (live(attempt)) events.error(message)
          },
          onDisconnect: () => {
            attempt.ended = true
            if (!attempt.starting && !attempt.cancelled) finish(attempt)
          },
        })
        attempt.session = session
        if (live(attempt) && !attempt.ended) {
          events.phase('connected')
        }
      } catch (error) {
        attempt.ended = true
        if (live(attempt)) {
          events.error(error instanceof Error ? error.message : 'Connection failed')
        }
      } finally {
        attempt.starting = false
        if (attempt.cancelled || attempt.ended) {
          events.phase('stopping')
          try {
            if (attempt.session) await end(attempt.session)
            finish(attempt)
          } catch {
            /* stay locked */
          }
        }
      }
    },
    async stop() {
      const attempt = current
      if (!attempt || attempt.cancelled) return
      attempt.cancelled = true
      attempt.abort.abort()
      events.phase('stopping')
      if (attempt.session && !attempt.starting) {
        try {
          await end(attempt.session)
          finish(attempt)
        } catch {
          /* stay locked */
        }
      }
    },
  }
}
```

Stopping during the token request aborts that request. Once SDK startup has begun, this example cannot immediately cancel a pending microphone permission prompt or WebRTC negotiation. It keeps Start locked until startup settles, then ends any late session. Dismiss a pending permission prompt if necessary; do not start another connection around it.

The SDK owns microphone capture and playback. There is no extra `getUserMedia()` call here that would create a second stream for your application to clean up.

## 5. Add the React interface

Replace `src/App.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { createVoice } from './voice'

export default function App() {
  const voice = useRef<ReturnType<typeof createVoice> | null>(null)
  const [phase, setPhase] = useState('idle')
  const [mode, setMode] = useState('listening')
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    const controller = createVoice({
      phase: (value) => {
        if (mounted) setPhase(value)
      },
      mode: (value) => {
        if (mounted) setMode(value)
      },
      error: (value) => {
        if (mounted) setError(value)
      },
      message: (value) => {
        if (mounted) setMessages((items) => [...items.slice(-49), value])
      },
    })
    voice.current = controller
    return () => {
      mounted = false
      voice.current = null
      void controller.stop()
    }
  }, [])

  function start() {
    setMessages([])
    setMode('listening')
    void voice.current?.start()
  }

  return (
    <main style={{ maxWidth: 720, margin: '3rem auto', padding: 24 }}>
      <h1>Talk to your ElevenLabs agent</h1>
      <p>Start enables your microphone and sends audio to the agent.</p>
      <p role="status">{phase === 'connected' ? mode : phase}</p>
      <button disabled={phase !== 'idle'} onClick={start}>
        Start conversation
      </button>
      <button
        disabled={phase === 'idle' || phase === 'stopping'}
        onClick={() => void voice.current?.stop()}
      >
        Stop
      </button>
      {error && <p role="alert">{error}</p>}
      <h2>Live text events</h2>
      <ol>
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ol>
    </main>
  )
}
```

Remove the generated contents of `src/index.css` to keep Vite's starter styling from controlling the layout. Keep the generated `src/main.tsx`; React Strict Mode can remain enabled.

This is a bounded **event feed**, not a finalized transcript. `onMessage` may include tentative text, and interrupted agent replies can be corrected later. For a durable transcript, reconcile event IDs and correction events or retrieve the final conversation record after the session. Do not treat every received text fragment as words the user actually heard.

## 6. Run and test a conversation

In one terminal:

```bash
node --env-file=.env server.mjs
```

In another:

```bash
npm run dev
```

Open `http://localhost:5173`, click **Start conversation**, and allow microphone access. Expect the agent's first message and a change between listening and speaking. Click **Stop** and confirm the browser's microphone indicator clears.

Test these cases before calling the integration ready:

| Action                                  | Expected result                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Deny microphone permission              | An error appears and a retry becomes possible                                 |
| Stop while the token request is pending | No conversation starts; the UI returns to idle                                |
| Stop while SDK startup is pending       | Start stays locked; any late session is ended                                 |
| Speak while the agent is speaking       | With interruptions enabled, playback stops and the agent handles the new turn |
| Stop and then start again               | Only one provider conversation is active                                      |
| Navigate away from the component        | The controller stops the active or pending session                            |
| Use an invalid server key               | A generic token error appears without exposing the key or upstream response   |

Check the ElevenLabs conversation dashboard as well as the browser. A disconnected interface alone does not prove your billing or server-side conversation has ended as intended.

## Common ElevenLabs React integration problems

**401 or 403 from the token flow:** verify the server key's permissions, private agent ID, and agent authentication settings. For this local server, open exactly `http://localhost:5173`; a different hostname fails the origin check.

**No microphone prompt:** use localhost or HTTPS, check browser permissions, and start from a user click. Test embedded pages separately because iframe permissions can restrict microphone access.

**Audio works but transcript events are missing:** check the agent's enabled client events. The SDK callback alone does not enable every event in the agent configuration.

**Stop remains pending:** dismiss a pending microphone prompt and allow SDK startup to resolve or reject. This example deliberately prevents a second concurrent startup. If cleanup reports an error, reload before reconnecting.

**The agent does not stop speaking when interrupted:** check turn-taking settings and test with headphones to separate genuine speech from speaker echo. The interface's interruption callback updates a label; it does not implement server-side turn detection.

## Deploy the application

Build the frontend with `npm run build`. Deploy the token route on a backend and route `/api/conversation-token` to it; Vite's development proxy is not part of the static build. Use HTTPS and keep the standard API key in the backend's secret store.

Replace the local origin guard with your production origin policy and real application authentication. Add authorization, request limits, and usage controls before allowing users to create billed sessions. Protect backend tools independently of what the agent says or what arguments it sends.

If you want an animated voice indicator, follow the [ElevenLabs orb-ui adapter guide](/docs/adapters/elevenlabs). Choose one session owner: either adapt the existing conversation's events into controlled UI state or replace the controller with the adapter-owned connection. Do not start a second conversation just to display an orb.

For alternative architectures, see [voice AI platforms compared](/blog/voice-ai-platforms) and the [OpenAI Realtime React tutorial](/blog/openai-realtime-api-tutorial).

## Sources

- [ElevenLabs JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script)
- [ElevenLabs React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react) — an alternative if you prefer provider hooks
- [Agent authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication)
- [Conversation flow and interruptions](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow)
- [Client events](https://elevenlabs.io/docs/eleven-agents/customization/events)
