import type { Plugin } from 'vite'
import realtime from './local/providers/openai-realtime-token'
import gemini from './local/providers/gemini-live-token'
import pipecat from './local/providers/pipecat-start'

/** Preserve the developer harness on loopback; these are never Vercel Functions. */
export function localProviderDevPlugin(): Plugin {
  const handlers = new Map([
    ['/api/openai-realtime-token', realtime],
    ['/api/gemini-live-token', gemini],
    ['/api/pipecat-start', pipecat],
  ])
  return {
    name: 'orb-ui-loopback-provider-harness',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = (request.url ?? '').split('?')[0]
        const handler = handlers.get(path)
        if (!handler) return next()
        const host = request.headers.host ?? ''
        const remote = request.socket.remoteAddress ?? ''
        const origin = request.headers.origin
        const isLoopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
        const validHost = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)
        if (!isLoopback || !validHost || origin !== `http://${host}` || request.method !== 'POST') {
          response.statusCode = 403
          response.end('Same-origin loopback POST required')
          return
        }
        try {
          const chunks: Uint8Array[] = []
          let length = 0
          for await (const chunk of request) {
            const bytes = new Uint8Array(chunk)
            length += bytes.length
            if (length > 65_536) throw new Error('Request too large')
            chunks.push(bytes)
          }
          const body = new Uint8Array(length)
          let offset = 0
          for (const chunk of chunks) {
            body.set(chunk, offset)
            offset += chunk.length
          }
          const result = await handler.fetch(
            new Request(`http://${host}${path}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            }),
          )
          response.statusCode = result.status
          result.headers.forEach((value, name) => response.setHeader(name, value))
          response.end(await result.text())
        } catch {
          response.statusCode = 400
          response.end('Local request failed')
        }
      })
    },
  }
}
