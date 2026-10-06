import { Orb } from '../../src'
import { createNovaSonicBridge } from '../../src/adapters/nova-sonic'
import type { NovaSonicEvent } from '../../src/adapters/nova-sonic'

const bridge = createNovaSonicBridge({
  onInterrupt: () => undefined,
  onTranscript: ({ role, text, final }) => void [role, text, final],
})
const event: NovaSonicEvent = {
  contentStart: {
    contentId: 'provider-content-id',
    type: 'TEXT',
    role: 'USER',
    additionalModelFields: '{"generationStage":"FINAL"}',
  },
}
bridge.beginSession('app-session-id')
bridge.connected('app-session-id')
bridge.handleEvent('app-session-id', event)
bridge.setPlayback('app-session-id', true, 0.5)
bridge.setInputVolume('app-session-id', 0.2)
bridge.endSession('app-session-id')

export function NovaSonicControlledRecipe() {
  return <Orb adapter={bridge} interactive={false} aria-label="Nova Sonic voice activity" />
}
