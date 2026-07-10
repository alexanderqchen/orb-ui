import { GoogleGenAI, Modality } from '@google/genai'

interface GeminiLiveTokenRequest {
  apiKey?: string
  instructions?: string
  model?: string
  voice?: string
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } })
    }

    let body: GeminiLiveTokenRequest
    try {
      body = (await request.json()) as GeminiLiveTokenRequest
    } catch {
      return json({ error: 'Expected a JSON request body.' }, { status: 400 })
    }

    const apiKey = body.apiKey?.trim()
    if (!apiKey) return json({ error: 'A Gemini API key is required.' }, { status: 400 })

    const model = body.model?.trim() || 'gemini-3.1-flash-live-preview'
    const liveConfig = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: body.voice?.trim() || 'Kore',
          },
        },
      },
      systemInstruction:
        body.instructions?.trim() ||
        'You are a concise, friendly voice assistant helping test a realtime React UI.',
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: true,
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    }

    try {
      const client = new GoogleGenAI({ apiKey })
      const token = await client.authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
          liveConnectConstraints: {
            model,
            config: liveConfig,
          },
          httpOptions: { apiVersion: 'v1alpha' },
        },
      })

      if (!token.name) {
        return json({ error: 'Gemini returned an empty ephemeral token.' }, { status: 502 })
      }

      return json({ value: token.name, model, config: liveConfig })
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : 'Gemini token creation failed.',
        },
        { status: 502 },
      )
    }
  },
}
