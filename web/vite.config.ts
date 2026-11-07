import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // same origin as the page so the cookie works without CORS
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
