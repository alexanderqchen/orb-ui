import { unavailableProviderProxy } from './public-demo-policy'

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** A local dev server may supply its key; deployed playgrounds require the caller's own key. */
export async function createLiveSession(request: Request, localApiKey?: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  let body: Record<string, unknown>
  try {
    body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body')
  } catch {
    return json({ error: 'Expected a JSON object.' }, 400)
  }
  const value = (key: string) => (typeof body[key] === 'string' ? body[key].trim() : '')
  const apiKey = value('apiKey') || localApiKey
  if (!apiKey) return json({ error: 'An OpenAI API key is required.' }, 400)
  // SDP is line-oriented; preserve the browser's trailing CRLF.
  const sdp = typeof body.sdp === 'string' ? body.sdp : ''
  if (!sdp.trim() || sdp.length > 64000)
    return json({ error: 'A valid SDP offer is required.' }, 400)

  try {
    const response = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
      body: JSON.stringify({
        session: {
          model: value('model') || 'gpt-live-1',
          store: false,
          instructions:
            value('instructions') ||
            'Be a friendly voice assistant. Honor interruptions and delegate factual questions to the backend.',
          delegation: {
            type: 'responses',
            responses: {
              model: value('backendModel') || 'gpt-5.6-terra',
              instructions:
                'Answer accurately and concisely for a spoken conversation. Follow the latest caller request.',
            },
          },
        },
        transport: { type: 'webrtc', sdp },
      }),
    })
    const payload = await response.json()
    if (!response.ok)
      return json(
        {
          error: `OpenAI Live session creation failed (${response.status}). Check your key and model access.`,
        },
        response.status,
      )
    if (!payload.session?.id || payload.transport?.type !== 'webrtc' || !payload.transport.sdp) {
      return json({ error: 'OpenAI returned an incomplete Live session.' }, 502)
    }
    return json({ session: { id: payload.session.id }, transport: payload.transport })
  } catch {
    return json({ error: 'OpenAI Live session request failed or timed out.' }, 502)
  }
}

export default { fetch: unavailableProviderProxy }
