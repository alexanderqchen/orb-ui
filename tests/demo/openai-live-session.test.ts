import { afterEach, describe, expect, it, vi } from 'vitest'
import handler, { createLiveSession } from '../../demo/api/openai-live-session'

const request = (body: unknown) =>
  new Request('http://localhost/api/openai-live-session', {
    method: 'POST',
    body: JSON.stringify(body),
  })

afterEach(() => vi.unstubAllGlobals())

describe('playground GPT-Live session endpoint', () => {
  it('keeps the local credential upstream and returns only the session transport', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        session: { id: 'live-test', private: 'omitted' },
        transport: { type: 'webrtc', sdp: 'answer' },
        extra: 'omitted',
      }),
    )
    vi.stubGlobal('fetch', fetch)
    const response = await createLiveSession(
      request({ sdp: 'v=0\r\n', backendModel: 'backend-test', instructions: 'test instructions' }),
      'local-test-key',
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      session: { id: 'live-test' },
      transport: { type: 'webrtc', sdp: 'answer' },
    })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/live/sessions')
    expect(init.headers.Authorization).toBe('Bearer local-test-key')
    expect(JSON.parse(init.body)).toMatchObject({
      session: {
        model: 'gpt-live-1',
        store: false,
        instructions: 'test instructions',
        delegation: { type: 'responses', responses: { model: 'backend-test' } },
      },
      transport: { type: 'webrtc', sdp: 'v=0\r\n' },
    })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('disables the hosted proxy even when a visitor supplies a key', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect((await handler.fetch(request({ sdp: 'offer' }))).status).toBe(403)
    expect((await handler.fetch(request({ apiKey: 'test', sdp: 'offer' }))).status).toBe(403)
    expect((await handler.fetch(request(null))).status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('redacts upstream errors and rejects incomplete success responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ error: { message: 'sensitive provider detail' } }, { status: 401 }),
        )
        .mockResolvedValueOnce(Response.json({ session: { id: 'incomplete' } })),
    )
    const response = await createLiveSession(request({ sdp: 'offer' }), 'test-key')
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain('sensitive provider detail')
    expect((await createLiveSession(request({ sdp: 'offer' }), 'test-key')).status).toBe(502)
  })

  it('propagates cancellation to the upstream request', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockImplementation((_url, init) => {
      controller.abort()
      expect(init.signal.aborted).toBe(true)
      throw new DOMException('Aborted', 'AbortError')
    })
    vi.stubGlobal('fetch', fetch)
    const response = await createLiveSession(
      new Request('http://localhost/api/openai-live-session', {
        method: 'POST',
        body: JSON.stringify({ sdp: 'offer' }),
        signal: controller.signal,
      }),
      'test-key',
    )
    expect(response.status).toBe(502)
    expect(fetch).toHaveBeenCalledOnce()
  })
})
