import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // En desarrollo, /api va al Worker local (`npm run dev:api`, puerto 8787).
  server: { proxy: { '/api': 'http://localhost:8787' } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'AgroFerti MIC — Gestión de fertilización',
        short_name: 'AgroFerti',
        description: 'Registra lotes y prepara el seguimiento de fertilización de varios cultivos.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f7faf6',
        theme_color: '#194c3b',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        // La API de la nube nunca se responde desde la caché del service worker.
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ]
});
