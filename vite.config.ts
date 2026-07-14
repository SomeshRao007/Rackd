import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Pages Functions (auth + sync) can't run under Vite, so they're served by
  // `npm run dev:api` (wrangler pages dev, :8788). Forward those paths to it so
  // the single `npm run dev` origin (:5173) keeps HMR and the auth buttons work.
  server: {
    proxy: {
      '/auth': 'http://localhost:8788',
      '/sync': 'http://localhost:8788',
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Pull the Web Push handlers (public/push-sw.js) into the generated SW without leaving generateSW (M7).
      // Let server-route navigations (Google OAuth login/callback + sync/share/push) reach the
      // Cloudflare Functions instead of being caught by the SPA navigateFallback (index.html).
      workbox: {
        importScripts: ['push-sw.js'],
        navigateFallbackDenylist: [/^\/auth\//, /^\/sync\//, /^\/share\//, /^\/push\//],
      },
      manifest: {
        name: 'Rackd — Workout Tracker',
        short_name: 'Rackd',
        description: 'Personal + family workout tracker, offline-first',
        theme_color: '#0c0f14',
        background_color: '#0c0f14',
        display: 'standalone',
        start_url: '/',
        // ponytail: reuse the existing SVG favicon; add maskable PNGs later.
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
