import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serviceWorkerSource } from './src/offline-worker.js';

let webRoot = process.cwd();

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'hobbymaxx-offline-shell',
      apply: 'build',
      enforce: 'post',
      configResolved(config) {
        webRoot = config.root;
      },
      async generateBundle(_options, bundle) {
        const assets = [
          ...new Set([
            '/',
            '/index.html',
            '/icon.svg',
            '/icons/icon-192.png',
            '/icons/icon-512.png',
            '/manifest.webmanifest',
            ...Object.keys(bundle).map((file) => `/${file}`),
          ]),
        ];
        const hash = createHash('sha256').update(
          Object.entries(bundle)
            .map(
              ([name, entry]) =>
                name + (entry.type === 'chunk' ? entry.code : String(entry.source)),
            )
            .join('|'),
        );
        for (const file of [
          'index.html',
          'public/icon.svg',
          'public/manifest.webmanifest',
          'public/icons/icon-192.png',
          'public/icons/icon-512.png',
        ]) {
          hash.update(await readFile(resolve(webRoot, file)));
        }
        const version = hash.digest('hex').slice(0, 16);
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: serviceWorkerSource(assets, version),
        });
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_PROXY_URL ?? 'http://127.0.0.1:3000' },
    },
  },
});
