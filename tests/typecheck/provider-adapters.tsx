import Vapi from '@vapi-ai/web'
import { Conversation } from '@elevenlabs/client'
import { GoogleGenAI, Modality } from '@google/genai'
import { PipecatClient } from '@pipecat-ai/client-js'
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport'
import { Orb } from '../../src'
import {
  createElevenLabsAdapter,
  createGeminiLiveAdapter,
  createOpenAIRealtimeAdapter,
  createPipecatAdapter,
  createVapiAdapter,
} from '../../src/adapters'
import { createLiveKitAdapter } from '../../src/adapters/livekit/browser'
import type { LegacyOrbAdapter, OrbAdapter, OrbSignal } from '../../src/adapters'

const vapi = new Vapi('public-key')
const vapiAdapter = createVapiAdapter(vapi, {
  assistantId: 'assistant-id',
})

const elevenLabsAdapter = createElevenLabsAdapter(Conversation, {
  agentId: 'agent-id',
})

const signedUrlElevenLabsAdapter = createElevenLabsAdapter(Conversation, {
  signedUrl: 'https://example.com/signed-url',
})

const tokenElevenLabsAdapter = createElevenLabsAdapter(Conversation, {
  conversationToken: 'conversation-token',
})

const liveKitAdapter = createLiveKitAdapter({
  tokenEndpoint: '/api/livekit-token',
  agentName: 'support-agent',
})

// @ts-expect-error LiveKit sandbox sessions must identify the agent to dispatch.
createLiveKitAdapter({ sandboxId: 'sandbox-123' })

// @ts-expect-error Choose a token endpoint or a sandbox, never both.
createLiveKitAdapter({
  tokenEndpoint: '/api/livekit-token',
  sandboxId: 'sandbox-123',
  agentName: 'support-agent',
})

const pipecatClient = new PipecatClient({
  transport: new SmallWebRTCTransport(),
  enableMic: true,
})
const pipecatAdapter = createPipecatAdapter(pipecatClient, {
  connect: () => pipecatClient.connect({ webrtcUrl: 'https://agent.example.com/api/offer' }),
})

const openAIRealtimeAdapter = createOpenAIRealtimeAdapter({
  getClientSecret: async () => ({ value: 'short-lived-client-secret' }),
})

const geminiClient = new GoogleGenAI({ apiKey: 'short-lived-live-token' })
const geminiLiveAdapter = createGeminiLiveAdapter({
  connect: async (callbacks) =>
    geminiClient.live.connect({
      model: 'gemini-3.1-flash-live-preview',
      config: { responseModalities: [Modality.AUDIO] },
      callbacks,
    }),
})

const customSignalAdapter: OrbAdapter = {
  subscribe(listener) {
    listener({ state: 'thinking' })
    listener({ state: 'speaking', outputVolume: 0.7 })
    return () => undefined
  },
}

const legacyAdapter: LegacyOrbAdapter = {
  subscribe(callbacks) {
    callbacks.onStateChange('listening')
    callbacks.onVolumeChange(0.4)
    return () => undefined
  },
}

const signal: OrbSignal = {
  state: 'speaking',
  inputVolume: 0.1,
  outputVolume: 0.7,
}

// @ts-expect-error ElevenLabs sessions require agentId, signedUrl, or conversationToken.
createElevenLabsAdapter(Conversation, {})

// @ts-expect-error signedUrl sessions only support websocket connections.
createElevenLabsAdapter(Conversation, {
  signedUrl: 'https://example.com/signed-url',
  connectionType: 'webrtc',
})

createElevenLabsAdapter(Conversation, {
  agentId: 'agent-id',
  // @ts-expect-error orb-ui needs a voice-capable ElevenLabs session.
  textOnly: true,
})

export function ProviderAdapterSmokeExamples() {
  return (
    <>
      <Orb
        adapter={vapiAdapter}
        theme="circle"
        id="vapi-orb"
        aria-label="Start Vapi voice assistant"
        disabled={false}
      />
      <Orb
        adapter={elevenLabsAdapter}
        theme="bars"
        id="elevenlabs-orb"
        aria-label="Start ElevenLabs voice assistant"
        disabled={false}
      />
      <Orb
        adapter={signedUrlElevenLabsAdapter}
        theme="circle"
        aria-label="Start private ElevenLabs voice assistant"
      />
      <Orb
        adapter={tokenElevenLabsAdapter}
        theme="circle"
        aria-label="Start token-based ElevenLabs voice assistant"
      />
      <Orb adapter={liveKitAdapter} theme="circle" aria-label="Start LiveKit voice assistant" />
      <Orb adapter={pipecatAdapter} theme="circle" aria-label="Start Pipecat voice assistant" />
      <Orb
        adapter={openAIRealtimeAdapter}
        theme="circle"
        aria-label="Start OpenAI Realtime voice assistant"
      />
      <Orb
        adapter={geminiLiveAdapter}
        theme="circle"
        aria-label="Start Gemini Live voice assistant"
      />
      <Orb adapter={customSignalAdapter} theme="circle" aria-label="Start custom voice assistant" />
      <Orb adapter={legacyAdapter} theme="debug" />
      <Orb signal={signal} theme="circle" />
      <Orb state="listening" volume={0.4} theme="debug" id="controlled-orb" />
    </>
  )
}
