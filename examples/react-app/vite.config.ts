import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /route は examples/web-app のサーバ（npm run dev で :8787）に流す。Jev キーはそちらにしか無い
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/route': 'http://localhost:8787' } },
})
