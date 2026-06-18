import Vapi from '@vapi-ai/web'
import { Conversation } from '@elevenlabs/client'
import { Orb } from '../../src'
import { createElevenLabsAdapter, createVapiAdapter } from '../../src/adapters'
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
      <Orb adapter={customSignalAdapter} theme="circle" aria-label="Start custom voice assistant" />
      <Orb adapter={legacyAdapter} theme="debug" />
      <Orb signal={signal} theme="circle" />
      <Orb state="listening" volume={0.4} theme="debug" id="controlled-orb" />
    </>
  )
}
