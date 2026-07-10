interface PipecatStartRequest {
  agentName?: string
  apiKey?: string
  body?: Record<string, unknown>
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

    let body: PipecatStartRequest
    try {
      body = (await request.json()) as PipecatStartRequest
    } catch {
      return json({ error: 'Expected a JSON request body.' }, { status: 400 })
    }

    const apiKey = body.apiKey?.trim()
    const agentName = body.agentName?.trim()
    if (!apiKey || !agentName) {
      return json(
        { error: 'A Pipecat Cloud public API key and agent name are required.' },
        {
          status: 400,
        },
      )
    }

    try {
      const response = await fetch(
        `https://api.pipecat.daily.co/v1/public/${encodeURIComponent(agentName)}/start`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            createDailyRoom: true,
            transport: 'daily',
            body: body.body ?? {},
          }),
        },
      )
      const payload = (await response.json()) as Record<string, unknown>

      if (!response.ok) {
        const providerMessage =
          typeof payload.detail === 'string'
            ? payload.detail
            : typeof payload.info === 'string'
              ? payload.info
              : `Pipecat Cloud session creation failed with status ${response.status}.`
        return json({ error: providerMessage }, { status: response.status })
      }

      return json(payload)
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : 'Pipecat Cloud session creation failed.',
        },
        { status: 502 },
      )
    }
  },
}
