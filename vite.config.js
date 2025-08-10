import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If you deploy at a subpath (e.g., GitHub Pages), change base to '/<repo-name>/'
export default defineConfig({
  plugins: [react()],
  base: '/'
})
