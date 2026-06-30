import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built bundle works when served by the `topo view` server.
export default defineConfig({
  base: './',
  plugins: [react()],
})
