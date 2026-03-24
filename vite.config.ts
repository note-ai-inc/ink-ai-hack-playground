import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'INK_')
  const recognitionApiUrl = env.INK_RECOGNITION_API_URL || 'https://strokes.hack.ink.ai'

  return {
    envPrefix: 'INK_',
    plugins: [react()],
    server: {
      proxy: {
        '/api/recognition': {
          target: recognitionApiUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/recognition/, ''),
        },
      },
    },
  }
})
