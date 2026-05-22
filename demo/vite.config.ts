import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
  },
  // Never pre-bundle orb-ui — it's a local workspace link and we want changes
  // to dist/ to be picked up immediately after pnpm build without cache clears.
  optimizeDeps: {
    exclude: ['orb-ui'],
  },
})
