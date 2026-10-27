import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2500 },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
