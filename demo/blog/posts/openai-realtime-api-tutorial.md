---
title: 'OpenAI Realtime API Tutorial: React and WebRTC'
description: Build a React voice agent with the OpenAI Realtime API, WebRTC, a server-side token endpoint, interruptions, function calling, and explicit cleanup.
date: '2026-09-28'
category: Tutorial
---

The OpenAI Realtime API lets a voice agent receive microphone audio and speak back over one persistent connection. This tutorial builds a React application with native WebRTC, a small Node.js server, and a harmless function the agent can call to read the browser's local time.

You do not need orb-ui to follow the tutorial. At the end, you can choose an orb-ui adapter if you want an audio-reactive interface without maintaining the connection code yourself.

API and pricing sources checked **September 28, 2026**. This guide uses **`gpt-realtime-2.1` and the GA Realtime API**. GPT-Live has a different protocol; see the [GPT-Live adapter guide](/docs/adapters/openai-live) if that is the API you intend to use.

## What you will build

The application has Start and Stop controls, visible connection status, assistant audio playback, automatic turn detection, and function calling. Its connection path is:

1. React asks for microphone access after a click.
2. Your server creates a short-lived client secret with `POST /v1/realtime/client_secrets`.
3. The browser exchanges a WebRTC SDP offer for an answer at `POST /v1/realtime/calls`, using that secret.
4. Microphone and assistant audio use media tracks. JSON session events and tool results use a data channel.

The standard OpenAI API key stays on your server. The browser receives only a short-lived credential. OpenAI also offers a [unified connection flow](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime) where your server exchanges the SDP directly; this example uses client secrets to match the orb-ui adapter's connection path.

## 1. Create the React project

Use Node.js 22.12 or later, an OpenAI API project with Realtime access and billing configured, and a browser with a microphone. API usage is billed separately from a ChatGPT subscription.

```bash
npm create vite@latest realtime-voice-demo -- --template react
cd realtime-voice-demo
npm install
npm install express
```

Create `.env` in the project root and add your server key:

```dotenv
OPENAI_API_KEY=replace-with-your-project-key
```

Add `.env` to `.gitignore`. Do not prefix the key with `VITE_`: Vite exposes those variables to browser code. Do not commit or paste your key into `src/App.jsx`.

Replace `vite.config.js` with this configuration. The fixed port makes the server's local origin check predictable:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
})
```

## 2. Create the server-side token endpoint

Save this as `server.mjs` in the project root. It binds only to your machine and accepts requests from the local Vite page. It sets the model, voice, turn detection, and available tool on the server.

```js
import express from 'express'

const app = express()

app.post('/api/realtime-token', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (req.headers.origin !== 'http://127.0.0.1:5173') {
    return res.status(403).json({ error: 'Unexpected request origin' })
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Set OPENAI_API_KEY on the server' })
  }

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime-2.1',
          instructions: 'Answer briefly. Use get_local_time when asked for the local time.',
          audio: {
            input: {
              turn_detection: {
                type: 'server_vad',
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { voice: 'marin' },
          },
          tools: [
            {
              type: 'function',
              name: 'get_local_time',
              description: 'Read the current time and timezone from the user browser.',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
              },
            },
          ],
          tool_choice: 'auto',
        },
      }),
    })
    if (!response.ok) {
      console.error('Realtime token request failed:', response.status)
      return res.status(response.status).json({ error: 'Could not create a Realtime token' })
    }
    const data = await response.json()
    if (typeof data.value !== 'string') throw new Error('Missing client secret')
    return res.json({ value: data.value })
  } catch {
    return res.status(502).json({ error: 'Realtime token service unavailable' })
  }
})

app.listen(3001, '127.0.0.1', () => console.log('Token server on http://127.0.0.1:3001'))
```

This is a local learning server. Before deploying it, add application authentication, per-user authorization and rate limits, and HTTPS. An origin check does not authenticate a user. Keep credentials out of logs and use a stable, privacy-preserving [safety identifier](https://developers.openai.com/api/docs/guides/safety-best-practices#implement-safety-identifiers) from your trusted backend when associating sessions with end users.

## 3. Connect React to the Realtime API

Replace `src/App.jsx` with the following. Start creates a fresh session; Stop aborts pending requests and releases the microphone, audio element, data channel, and peer connection. The same cleanup runs when React unmounts the component.

```jsx
import { useEffect, useRef, useState } from 'react'

export default function App() {
  const session = useRef(null)
  const audio = useRef(null)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState('Idle')

  function release() {
    const current = session.current
    session.current = null
    if (!current) return
    clearTimeout(current.timer)
    current.abort.abort()
    current.stream?.getTracks().forEach((track) => track.stop())
    current.channel?.close()
    current.peer.close()
    if (audio.current) audio.current.srcObject = null
  }

  useEffect(() => () => release(), [])

  function stop() {
    release()
    setActive(false)
    setStatus('Stopped')
  }

  async function start() {
    if (session.current) return
    const current = { peer: new RTCPeerConnection(), abort: new AbortController() }
    session.current = current
    setActive(true)
    setStatus('Connecting')
    const isCurrent = () => session.current === current
    const fail = (message) => {
      if (!isCurrent()) return
      release()
      setActive(false)
      setStatus(message)
    }
    current.timer = setTimeout(() => fail('Connection timed out. Try again.'), 20000)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!isCurrent()) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      current.stream = stream
      stream.getAudioTracks().forEach((track) => current.peer.addTrack(track, stream))
      current.peer.ontrack = ({ track }) => {
        if (!isCurrent() || !audio.current) return
        audio.current.srcObject = new MediaStream([track])
        audio.current.play().catch(() => {
          if (isCurrent()) setStatus('Connected. Press play below to hear the agent.')
        })
      }
      current.peer.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(current.peer.connectionState)) {
          fail('Connection ended. Start a new session.')
        }
      }

      const channel = current.peer.createDataChannel('oai-events')
      current.channel = channel
      channel.onclose = () => fail('Event channel closed. Start a new session.')
      channel.onerror = () => fail('Event channel failed. Try again.')
      channel.onmessage = ({ data }) => {
        if (!isCurrent()) return
        const event = JSON.parse(data)
        if (event.type === 'session.created') {
          clearTimeout(current.timer)
          setStatus('Connected. Ask a question.')
        }
        if (event.type === 'input_audio_buffer.speech_started') setStatus('Listening')
        if (event.type === 'input_audio_buffer.speech_stopped') setStatus('Thinking')
        if (event.type === 'output_audio_buffer.started') setStatus('Speaking')
        if (['output_audio_buffer.stopped', 'output_audio_buffer.cleared'].includes(event.type)) {
          setStatus('Listening')
        }
        if (event.type === 'error') fail(event.error?.message ?? 'Realtime error')

        if (event.type === 'response.done' && event.response.status === 'completed') {
          const calls = (event.response.output ?? []).filter(
            (item) => item.type === 'function_call',
          )
          for (const call of calls) {
            // Only this harmless, explicitly registered browser tool is allowed.
            const result =
              call.name === 'get_local_time'
                ? {
                    time: new Date().toLocaleString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  }
                : { error: 'Unknown tool' }
            channel.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: call.call_id,
                  output: JSON.stringify(result),
                },
              }),
            )
          }
          if (calls.length) channel.send(JSON.stringify({ type: 'response.create' }))
        }
      }

      const offer = await current.peer.createOffer()
      if (!isCurrent()) return
      await current.peer.setLocalDescription(offer)
      if (!isCurrent()) return
      const tokenResponse = await fetch('/api/realtime-token', {
        method: 'POST',
        signal: current.abort.signal,
      })
      if (!tokenResponse.ok) throw new Error(`Token request failed (${tokenResponse.status})`)
      const { value } = await tokenResponse.json()
      if (!isCurrent()) return
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        signal: current.abort.signal,
        headers: { Authorization: `Bearer ${value}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })
      if (!response.ok) throw new Error(`WebRTC negotiation failed (${response.status})`)
      const sdp = await response.text()
      if (!isCurrent()) return
      await current.peer.setRemoteDescription({ type: 'answer', sdp })
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Could not connect')
    }
  }

  return (
    <main>
      <h1>Realtime voice agent</h1>
      <p role="status">{status}</p>
      <button onClick={start} disabled={active}>
        Start conversation
      </button>
      <button onClick={stop} disabled={!active}>
        Stop
      </button>
      <audio ref={audio} autoPlay controls aria-label="Assistant audio" />
    </main>
  )
}
```

## 4. Run and check the conversation

In one terminal, start the token server:

```bash
node --env-file=.env server.mjs
```

In a second terminal, start Vite:

```bash
npm run dev
```

Open **http://127.0.0.1:5173**, click **Start conversation**, and allow microphone access. Say “Explain WebRTC in one sentence.” The page should move through Listening, Thinking, and Speaking as you hear the answer.

Then check these cases:

| Action                                | Expected behavior                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Ask “What time is it here?”           | The model calls `get_local_time`, receives its result, and speaks the answer.        |
| Ask for a long answer, then interrupt | The API cancels the ongoing response and handles unplayed audio through WebRTC.      |
| Stop, then start again                | The old microphone tracks close and a fresh client secret is requested.              |
| Stop while connecting                 | Pending requests abort; microphone access granted afterward is immediately released. |
| Deny microphone access                | An error appears and Start becomes available again.                                  |

Each connected conversation uses paid API resources. Stop when finished.

## How interruptions and function calling work

`server_vad` detects speech boundaries. With `create_response` and `interrupt_response` enabled, the API responds after a turn and interrupts an answer when new speech begins. For WebRTC, the server manages output buffering and [truncates unplayed audio](https://developers.openai.com/api/docs/guides/realtime-conversations#interruption-and-truncation). You do not need to stream PCM chunks or calculate playback truncation yourself.

The tool handler waits for a completed `response.done`, collects function calls, and sends a `function_call_output` for each matching `call_id`. One subsequent `response.create` asks the model to speak using those results. It ignores cancelled responses so an interrupted answer does not execute a stale tool call.

Reading a browser clock is safe to demonstrate client-side. Put database access, private credentials, and actions such as booking or payment on an authenticated server. Validate arguments and user permissions independently of the model; use [server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=realtime) for trusted tools. The browser is not an authorization boundary.

## OpenAI Realtime API pricing

[OpenAI's pricing page](https://developers.openai.com/api/docs/pricing) lists these `gpt-realtime-2.1` rates as of September 28, 2026, in USD per one million tokens:

| Modality | Input   | Cached input | Output  |
| -------- | ------- | ------------ | ------- |
| Audio    | \$32.00 | \$0.40       | \$64.00 |
| Text     | \$4.00  | \$0.40       | \$24.00 |

For example, **1,000 uncached audio input tokens and 1,000 audio output tokens cost \$0.096 for those audio tokens**: `(1,000 × 32 + 1,000 × 64) / 1,000,000`. Text, reasoning, additional context, and any separate services add to that amount. This is a token arithmetic example, not a measured per-minute price.

Realtime does not have one universal per-minute cost: speaking time, conversation context, caching, and reasoning effort affect the bill. Inspect response usage and your project billing dashboard using representative conversations. Set spending controls, keep answers concise, and end unused sessions. GPT-Live's duration pricing is a different billing model.

## Troubleshooting

| Symptom                          | Check                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Token request returns 403        | Open `127.0.0.1:5173`, not `localhost:5173`; this example intentionally checks that exact origin.           |
| Token request returns 401 or 429 | Check the server key, model access, available billing credit, and API rate limits.                          |
| WebRTC negotiation fails         | Mint a fresh secret, check the HTTP status, and confirm your network permits WebRTC.                        |
| Connected but silent             | Press play on the audio controls; check the microphone, speaker, permissions, and browser autoplay rules.   |
| Agent does not call the tool     | Ask explicitly for local time; inspect `response.done` and the server's tool configuration.                 |
| Old tutorial code fails          | Use GA `client_secrets` and `calls` endpoints; do not combine Realtime events with GPT-Live session events. |

## Add an orb-ui interface

For a voice interface with normalized listening, thinking, speaking, and audio levels, the [OpenAI Realtime adapter](/docs/adapters/openai-realtime) can own the browser connection. Its `getClientSecret` callback can use the endpoint above **after removing the demo tool configuration**, because this adapter does not implement the tutorial's custom function handler.

Choose one connection owner. Replace the raw WebRTC client when adopting the adapter; running both would open two sessions. If you need to keep custom function handling, retain your own connection and render orb-ui in [controlled mode](/docs/adapters/custom) instead.

## Related guides and sources

- [OpenAI WebRTC connection guide](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime)
- [OpenAI Realtime conversations and function calling](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [GPT-Realtime-2.1 model](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)
- [Voice agent UI architecture](/docs/guides/voice-agent-ui)
- [Vapi vs Retell comparison](/blog/vapi-vs-retell)
