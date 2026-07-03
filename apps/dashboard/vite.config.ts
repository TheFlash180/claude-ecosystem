import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// In CI, VITE_BASE is set to /<repo>/<app>/ so assets resolve on
// GitHub Pages. Locally it defaults to / for vite dev.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Ecosystem Dashboard',
        short_name: 'Dashboard',
        description: 'Unified front door for the personal automation ecosystem',
        theme_color: '#16181d',
        background_color: '#16181d',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache app shell for offline; network-first for API calls.
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
});
