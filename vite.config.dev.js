import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Development config for Docker Compose
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:5000',
        changeOrigin: true,
      },
    },
  },
})