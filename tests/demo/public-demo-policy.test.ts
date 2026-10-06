import { expect, test, vi } from 'vitest'
import realtime from '../../demo/api/openai-realtime-token'
import live from '../../demo/api/openai-live-session'
import gemini from '../../demo/api/gemini-live-token'
import pipecat from '../../demo/api/pipecat-start'

test('all deployed provider routes reject traffic without reading keys or making upstream calls', async () => {
  const upstream = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Unexpected upstream call'))
  try {
    for (const handler of [realtime, live, gemini, pipecat]) {
      const request = new Request('https://orb-ui.com/api/provider', {
        method: 'POST',
        body: JSON.stringify({ apiKey: 'synthetic-test-key' }),
      })
      const readBody = vi.spyOn(request, 'json')
      expect((await handler.fetch(request)).status).toBe(403)
      expect(readBody).not.toHaveBeenCalled()
    }
    expect(upstream).not.toHaveBeenCalled()
  } finally {
    upstream.mockRestore()
  }
})
