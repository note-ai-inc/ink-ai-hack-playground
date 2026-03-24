import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  envPrefix: 'INK_',
  plugins: [react()],
  server: {
    proxy: {
      '/api/recognition': {
        target: 'https://strokes.hack.ink.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/recognition/, ''),
      },
    },
  },
})
