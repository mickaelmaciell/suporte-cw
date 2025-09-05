import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


export default defineConfig({
  plugins: [react()],
  base: '/suporte-cw/',
  optimizeDeps: {
    exclude: ['file-saver', 'jszip'],
  },
})
