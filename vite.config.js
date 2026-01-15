import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If you deploy at a subpath (e.g., GitHub Pages), change base to '/<repo-name>/'
export default defineConfig({
  plugins: [react()],
  base: '/',
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
