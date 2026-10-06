import type { Plugin } from 'vite'
import { env } from 'node:process'
import { createLiveSession } from './api/openai-live-session'

/** Keep the optional server credential confined to same-origin loopback requests. */
export function openAILiveDevPlugin(): Plugin {
  return {
    name: 'orb-ui-openai-live-local',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path !== '/api/openai-live-session' && path !== '/api/openai-live-status') return next()
        const reply = (status: number, data: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(data))
        }
        const origin = `http://${req.headers.host}`
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? ''))
          return reply(403, { error: 'Local access only.' })
        let hostname: string
        try {
          hostname = new URL(origin).hostname
        } catch {
          return reply(403, { error: 'Local access only.' })
        }
        if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname))
          return reply(403, { error: 'Local access only.' })
        if (path === '/api/openai-live-status' && req.method === 'GET') {
          return reply(200, { configured: Boolean(env.OPENAI_API_KEY) })
        }
        if (req.method !== 'POST' || req.headers.origin !== origin)
          return reply(403, { error: 'Same-origin POST required.' })
        const controller = new AbortController()
        res.on('close', () => {
          if (!res.writableEnded) controller.abort()
        })
        try {
          let body = ''
          for await (const chunk of req) {
            body += chunk
            if (body.length > 100000) return reply(413, { error: 'Request too large.' })
          }
          const result = await createLiveSession(
            new Request(`${origin}${path}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
              signal: controller.signal,
            }),
            env.OPENAI_API_KEY,
          )
          res.writeHead(result.status, Object.fromEntries(result.headers))
          res.end(await result.text())
        } catch {
          reply(502, { error: 'Local Live session request failed.' })
        }
      })
    },
  }
}
