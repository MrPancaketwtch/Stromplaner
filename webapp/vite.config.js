import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE_URL ?? (process.env.GITHUB_PAGES ? '/Stromplaner/' : '/');
// Gleiche Versionsnummer wie die Desktop-App – der Planer-Server lässt nur gleiche Versionen in eine Sitzung
const appVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  resolve: {
    // Sitzungslogik wird mit der Desktop-App geteilt (app/sync); React muss trotzdem nur einmal vorkommen
    alias: { '@sync': fileURLToPath(new URL('../app/sync', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: [repoRoot] } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png'],
      manifest: {
        name: 'Stromplaner',
        short_name: 'Stromplaner',
        description: 'Elektrische Verteilerpläne für Veranstaltungen',
        theme_color: '#1c2127',
        background_color: '#15191e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        icons: [
          { src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
});
