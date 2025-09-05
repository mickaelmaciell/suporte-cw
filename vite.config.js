// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel injeta a env VERCEL=1 nas builds
const isVercel = process.env.VERCEL === '1'

export default defineConfig({
  plugins: [react()],
  base: isVercel ? '/' : '/suporte-cw/',  // Vercel -> '/', GitHub Pages -> '/suporte-cw/'
})
