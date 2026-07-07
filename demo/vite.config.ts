import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

function resolveInput(path: string) {
  return fileURLToPath(new URL(path, import.meta.url))
}

function playgroundRoutePlugin(): Plugin {
  return {
    name: 'orb-ui-playground-route',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = request.url ?? ''
        const [pathname, query] = url.split('?')

        if (
          pathname === '/playground' ||
          pathname === '/provider-playground' ||
          pathname === '/provider-playground/' ||
          pathname === '/provider-playground.html'
        ) {
          request.url = `/playground/${query ? `?${query}` : ''}`
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), playgroundRoutePlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolveInput('./index.html'),
        playground: resolveInput('./playground/index.html'),
      },
    },
  },
  server: {
    allowedHosts: true,
  },
  // Never pre-bundle orb-ui — it's a local workspace link and we want changes
  // to dist/ to be picked up immediately after pnpm build without cache clears.
  optimizeDeps: {
    exclude: ['orb-ui'],
  },
})
