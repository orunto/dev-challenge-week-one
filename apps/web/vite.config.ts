import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { serviceWorkerSource } from './src/offline-worker.js';

export default defineConfig({
  plugins: [react(), {
    name: 'hobbymaxx-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const assets = [...new Set(['/', '/index.html', '/icon.svg', '/manifest.webmanifest', ...Object.keys(bundle).map((file) => `/${file}`)])];
      const version = createHash('sha256').update(Object.entries(bundle).map(([name, entry]) => name + (entry.type === 'chunk' ? entry.code : String(entry.source))).join('|')).digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(assets, version) });
    },
  }],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_PROXY_URL ?? 'http://127.0.0.1:3000' },
    },
  },
});
