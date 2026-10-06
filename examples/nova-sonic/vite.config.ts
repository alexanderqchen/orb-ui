import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:3001', changeOrigin: true, ws: true },
    },
  },
})
