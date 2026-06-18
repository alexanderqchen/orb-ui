import { Orb } from 'orb-ui'
import { createElevenLabsAdapter } from 'orb-ui/adapters'
import type { ElevenLabsConversationClass, OrbAdapter, OrbSignal } from 'orb-ui/adapters'

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

export function PackageConsumerSmoke() {
  return (
    <>
      <Orb adapter={elevenLabsAdapter} theme="circle" aria-label="Start ElevenLabs assistant" />
      <Orb adapter={customAdapter} theme="debug" />
      <Orb signal={signal} theme="circle" />
    </>
  )
}
