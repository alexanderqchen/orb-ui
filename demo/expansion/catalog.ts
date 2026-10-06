export const integrations = [
  ['retell', 'Retell WebCall', 'Session events and audio snapshots'],
  ['hume', 'Hume EVI', 'Observe an existing VoiceProvider'],
  ['deepgram', 'Deepgram Voice Agent', 'Browser session and React bridge'],
  ['agora', 'Agora Conversational AI', 'Toolkit and app-owned RTC audio'],
  ['azure-voice-live', 'Azure Voice Live', 'JavaScript session and media bridge'],
  ['cartesia', 'Cartesia Managed Agents', 'Line WebSocket session'],
  ['nova-sonic', 'Amazon Nova 2 Sonic', 'Node, Socket.IO, and Bedrock recipe'],
] as const

export const recipes = [
  ['push-to-talk', 'Push-to-talk composer', 'Capture, edit, and send a transcript'],
  ['voice-form', 'Voice form', 'Review fields before confirming'],
  ['document-qa', 'Voice document Q&A', 'Answers with inspectable citations'],
  ['guided-onboarding', 'Voice-guided onboarding', 'Step feedback, tools, and undo'],
  ['language-practice', 'Language practice', 'Corrections and repeat attempts'],
  ['interview-rehearsal', 'Interview rehearsal', 'Question progress and retry'],
  ['product-search', 'Spoken product search', 'Filters and useful result cards'],
  ['audio-narration', 'Audio-reactive narration', 'Timed transcript highlighting'],
] as const

export const expansionPaths = [
  ...integrations.map(([slug]) => `adapters/${slug}`),
  ...recipes.map(([slug]) => `recipes/${slug}`),
]
