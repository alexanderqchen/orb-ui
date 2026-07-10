import { Orb } from 'orb-ui'
import {
  createElevenLabsAdapter,
  createGeminiLiveAdapter,
  createLiveKitAdapter,
  createOpenAIRealtimeAdapter,
  createPipecatAdapter,
} from 'orb-ui/adapters'
import type {
  ElevenLabsConversationClass,
  GeminiLiveSession,
  LiveKitAdapterConfig,
  OrbAdapter,
  OrbSignal,
  PipecatClientLike,
} from 'orb-ui/adapters'

const Conversation: ElevenLabsConversationClass = {
  startSession: async () => ({
    endSession: async () => undefined,
    getInputVolume: () => 0,
    getOutputVolume: () => 0,
    getInputByteFrequencyData: () => new Uint8Array(),
    getOutputByteFrequencyData: () => new Uint8Array(),
  }),
}

const elevenLabsAdapter = createElevenLabsAdapter(Conversation, {
  agentId: 'agent-id',
})

const customAdapter: OrbAdapter = {
  subscribe: (listener) => {
    listener({ state: 'thinking' })
    return () => undefined
  },
}

const signal: OrbSignal = {
  state: 'speaking',
  outputVolume: 0.7,
}

const liveKitConfig: LiveKitAdapterConfig = {
  getConnectionDetails: async () => ({
    serverUrl: 'wss://example.livekit.cloud',
    participantToken: 'livekit-token',
  }),
  createAudioAnalyser: () => ({
    calculateVolume: () => 0,
    cleanup: async () => undefined,
  }),
  RoomClass: class {
    remoteParticipants = new Map()
    localParticipant = {
      setMicrophoneEnabled: async () => undefined,
    }
    state = 'disconnected'
    connect = async () => undefined
    disconnect = () => undefined
    on = () => undefined
    off = () => undefined
  },
}

const liveKitAdapter = createLiveKitAdapter(liveKitConfig)

const pipecatClient: PipecatClientLike = {
  on: () => undefined,
  off: () => undefined,
  connect: async () => undefined,
  disconnect: async () => undefined,
}
const pipecatAdapter = createPipecatAdapter(pipecatClient)

const openAIRealtimeAdapter = createOpenAIRealtimeAdapter({
  getClientSecret: async () => 'short-lived-client-secret',
})

const geminiSession: GeminiLiveSession = {
  sendRealtimeInput: () => undefined,
  close: () => undefined,
}
const geminiLiveAdapter = createGeminiLiveAdapter({
  connect: async () => geminiSession,
})

export function PackageConsumerSmoke() {
  return (
    <>
      <Orb adapter={elevenLabsAdapter} theme="circle" aria-label="Start ElevenLabs assistant" />
      <Orb adapter={liveKitAdapter} theme="circle" aria-label="Start LiveKit assistant" />
      <Orb adapter={pipecatAdapter} theme="circle" aria-label="Start Pipecat assistant" />
      <Orb adapter={openAIRealtimeAdapter} theme="circle" aria-label="Start OpenAI assistant" />
      <Orb adapter={geminiLiveAdapter} theme="circle" aria-label="Start Gemini assistant" />
      <Orb adapter={customAdapter} theme="debug" />
      <Orb signal={signal} theme="circle" />
    </>
  )
}
