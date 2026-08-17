import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    /**
     * Proxy /api to the Worker running under `wrangler dev`. This keeps the
     * browser on one origin in development, matching production (where
     * Cloudflare Pages routes /api/* to the Worker) and matching how the old
     * Express app behaved, where one process served both.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
