import { useEffect, useMemo, useState } from 'react'
import { VoiceLiveClient, type VoiceLiveSession } from '@azure/ai-voicelive'
import Cartesia from '@cartesia/cartesia-js'
import { Orb } from '../../src'
import {
  createAzureVoiceLiveAdapter,
  type AzureVoiceLiveSession,
} from '../../src/adapters/azure-voice-live'
import { createCartesiaAdapter } from '../../src/adapters/cartesia'

// Accept the resource owner's TokenCredential; exclude the SDK's API-key alternative.
type BrowserTokenCredential = Exclude<
  ConstructorParameters<typeof VoiceLiveClient>[1],
  { key: string }
>

// Assignment deliberately checks the real SDK class, including subscription callback variance.
function assertSDKCompatibility(session: VoiceLiveSession): AzureVoiceLiveSession {
  return session
}
void assertSDKCompatibility

export function AzureVoiceLiveExample({
  endpoint,
  credential,
}: {
  endpoint: string
  credential: BrowserTokenCredential
}) {
  const [caption, setCaption] = useState('')
  const adapter = useMemo(
    () =>
      createAzureVoiceLiveAdapter({
        createSession: () => {
          const client = new VoiceLiveClient(endpoint, credential)
          return client.createSession('gpt-realtime-mini')
        },
        configureSession: async (session) => {
          await session.updateSession({
            modalities: ['text', 'audio'],
            voice: { type: 'azure-standard', name: 'en-US-AvaNeural' },
            instructions: 'Respond concisely. Ask before performing actions.',
            inputAudioTranscription: { model: 'azure-speech' },
          })
        },
        onEvent: (event) => {
          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            setCaption(event.transcript ?? '')
          }
        },
      }),
    [endpoint, credential],
  )
  useEffect(() => () => void adapter.stop().catch(() => undefined), [adapter])
  return (
    <section>
      <Orb adapter={adapter} theme="circle" aria-label="Start or stop Azure Voice Live" />
      <p aria-live="polite">{caption}</p>
    </section>
  )
}

// Trusted backend only: do not import this client into a browser token endpoint consumer.
export async function mintCartesiaAgentToken(serverApiKey: string) {
  const client = new Cartesia({ apiKey: serverApiKey })
  return client.accessToken.create({ expires_in: 60, grants: { agent: true } })
}

export function CartesiaManagedAgentExample({ agentId }: { agentId: string }) {
  const [caption, setCaption] = useState('')
  const adapter = useMemo(
    () =>
      createCartesiaAdapter({
        agentId,
        inputFormat: 'pcm_24000',
        getAccessToken: async (signal) => {
          const response = await fetch('/api/my-cartesia-agent-token', { method: 'POST', signal })
          if (!response.ok) throw new Error('Could not authorize your Cartesia agent')
          const data: { token: string } = await response.json()
          return data.token
        },
        onEvent: (event) => {
          if (event.type === 'turn_ended') setCaption(event.text ?? '')
        },
      }),
    [agentId],
  )
  useEffect(() => () => void adapter.stop().catch(() => undefined), [adapter])
  return (
    <section>
      <Orb adapter={adapter} theme="circle" aria-label="Start or stop Cartesia agent" />
      <p aria-live="polite">{caption}</p>
    </section>
  )
}
