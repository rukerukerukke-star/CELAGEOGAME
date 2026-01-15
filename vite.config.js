import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages用の設定
export default defineConfig({
  plugins: [react()],
  base: '/CELAGEOGAME/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
    hmr: {
      clientPort: 443,
      protocol: 'wss'
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false
  }
})
