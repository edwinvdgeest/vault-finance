import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.VAULT_API_PROXY ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

