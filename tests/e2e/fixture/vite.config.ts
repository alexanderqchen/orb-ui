import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'tests/e2e/fixture',
  plugins: [react()],
  server: {
    strictPort: true,
  },
})
