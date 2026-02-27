import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const LOG_PATH = path.resolve(__dirname, '../volume-debug.log')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'volume-logger',
      configureServer(server) {
        server.middlewares.use('/api/volume-log', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end()
            return
          }
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              fs.appendFileSync(LOG_PATH, body + '\n')
              res.statusCode = 200
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end('ok')
            } catch (e) {
              res.statusCode = 500
              res.end(String(e))
            }
          })
        })
      },
    },
  ],
  server: {
    allowedHosts: true,
  },
})
