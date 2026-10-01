import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /**
     * Runs the Worker inside this dev server, in workerd: one process, one
     * origin, hot reload for the SPA. See docs/adr/0004-the-development-loop.md.
     *
     * configPath: the Worker configuration stays in worker/. The plugin only
     * looks for it in this folder (app/), so it is named here.
     *
     * persistState: the same local KV and D1 that `bun run start` uses. Without
     * it the plugin keeps its own empty copy in app/.wrangler, no studio is
     * registered there, and sign-in fails.
     */
    cloudflare({
      configPath: '../worker/wrangler.jsonc',
      persistState: { path: '../worker/.wrangler/state' },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  /**
   * The same port as `bun run start`, so the same origin: APP_ORIGIN, and the
   * OAuth redirect URI registered on the studio's ERPNext, are correct for
   * both. strictPort fails loudly if :8787 is busy, instead of moving to a
   * second origin where sign-in cannot return.
   */
  server: { port: 8787, strictPort: true },
  preview: { port: 8787, strictPort: true },
});
