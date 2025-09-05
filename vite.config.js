import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base: '/', // no Vercel não precisa alterar base
  build: {
    outDir: 'dist'
  },
  // Evita otimização esquisita de alguns workers/libs
  optimizeDeps: {
    exclude: []
  }
})
