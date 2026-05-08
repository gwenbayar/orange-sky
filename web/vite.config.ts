import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxies /api/* to the FastAPI server during dev so the browser hits a
// single origin and CORS isn't required in production.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
