import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { ARCHIVOS_REFERENCIAS, cuerpoReferencias, validarReferencias } from './src/lib/paqueteReferencias.ts';

/**
 * Publica las referencias técnicas (catálogo ICA, precios DANE, reglas de dosis) con cada despliegue,
 * en dist/api/referencias/: así un cambio en data/referencias/ (por ejemplo, los precios del DANE de
 * cada mes) llega a los teléfonos sin cargar nada a mano en D1. Bajo /api/ no se pueden descargar
 * directamente: solo el Worker los entrega, a quien inició sesión. Si una referencia no es válida, el
 * build se detiene.
 */
function referenciasEstaticas(): Plugin {
  return {
    name: 'referencias-estaticas',
    apply: 'build',
    generateBundle() {
      const leer = (archivo: string): unknown[] => JSON.parse(readFileSync(new URL(`./data/referencias/${archivo}`, import.meta.url), 'utf8'));
      const { filas, errores } = validarReferencias(ARCHIVOS_REFERENCIAS.map(a => ({ ...a, items: leer(a.archivo) })));
      if (errores.length) throw new Error(`Referencias no válidas:\n- ${errores.slice(0, 20).join('\n- ')}`);
      const version = createHash('sha256').update(JSON.stringify(filas)).digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'api/referencias/datos.json', source: cuerpoReferencias(filas, version) });
      this.emitFile({ type: 'asset', fileName: 'api/referencias/version.json', source: JSON.stringify({ version }) });
    }
  };
}

export default defineConfig({
  // En desarrollo, /api va al Worker local (`npm run dev:api`, puerto 8787).
  server: { proxy: { '/api': 'http://localhost:8787' } },
  plugins: [
    react(),
    referenciasEstaticas(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'AgroFerti MIC — Gestión de fertilización',
        short_name: 'AgroFerti',
        description: 'Registra lotes y prepara el seguimiento de fertilización de papa.',
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
        // La lectura de PDF solo se descarga cuando se usa (pesa más que el resto de la app).
        globIgnores: ['**/pdf-*.js', '**/pdf.worker*'],
        navigateFallback: '/index.html',
        // La API de la nube nunca se responde desde la caché del service worker.
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ]
});
