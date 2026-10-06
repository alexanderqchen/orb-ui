interface OpenAIRealtimeTokenRequest {
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

    let body: OpenAIRealtimeTokenRequest
    try {
      body = (await request.json()) as OpenAIRealtimeTokenRequest
    } catch {
      return json({ error: 'Expected a JSON request body.' }, { status: 400 })
    }

    const apiKey = body.apiKey?.trim()
    if (!apiKey) return json({ error: 'An OpenAI API key is required.' }, { status: 400 })

    const session = {
      type: 'realtime',
      model: body.model?.trim() || 'gpt-realtime-2.1',
      instructions:
        body.instructions?.trim() ||
        'You are a concise, friendly voice assistant helping test a realtime React UI.',
      audio: {
        output: {
          voice: body.voice?.trim() || 'marin',
        },
      },
    }

    try {
      const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session }),
      })
      const payload = (await response.json()) as {
        value?: string
        expires_at?: number
        error?: { message?: string }
      }

      if (!response.ok || !payload.value) {
        return json(
          {
            error:
              payload.error?.message ||
              `OpenAI client-secret creation failed with status ${response.status}.`,
          },
          { status: response.ok ? 502 : response.status },
        )
      }

      return json({ value: payload.value, expiresAt: payload.expires_at })
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : 'OpenAI client-secret creation failed.',
        },
        { status: 502 },
      )
    }
  },
}
