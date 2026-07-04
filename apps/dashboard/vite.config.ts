import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The dashboard is the hub: in CI it builds at the site ROOT
// (VITE_BASE=/<repo>/), so the installed PWA's scope covers every sub-app
// and the whole ecosystem lives inside one installed app.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Ecosystem',
        short_name: 'Ecosystem',
        description: 'One home for all my apps',
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
        navigateFallback: `${base}index.html`,
        // Never serve the hub shell for sub-app routes (/<base>/<app>/...) —
        // each sub-app has its own service worker and offline handling.
        navigateFallbackDenylist: [new RegExp(`^${base}[^/]+/`)],
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
