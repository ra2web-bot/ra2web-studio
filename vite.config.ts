import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  build: {
    rollupOptions: {
      external: [],
      output: {
        manualChunks: undefined,
      },
    },
    target: 'es2015',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'three'],
    exclude: ['@ffmpeg/ffmpeg'],
  },
  worker: {
    format: 'es',
  },
  assetsInclude: ['**/*.wasm'],
})
