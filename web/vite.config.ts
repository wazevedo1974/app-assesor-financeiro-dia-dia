import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    allowedHosts: ['keen-vitality-production.up.railway.app', '.railway.app'],
  },
  preview: {
    allowedHosts: ['keen-vitality-production.up.railway.app', '.railway.app'],
  },
})
