import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Los WASM del SQLite de PowerSync pesan hasta 2,5 MB, y Workbox por defecto no guarda nada
// de más de 2 MiB. Sin subir el tope, la app abriría sin internet pero la base local no.
const TOPE_POR_ARCHIVO = 5 * 1024 * 1024;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // La app abre sin internet (SPEC-KRILINXI-011). El service worker es nuestro (`src/pwa/sw.ts`)
    // y no uno generado, porque decide cuándo pasar a una versión nueva (`src/pwa/actualizar.ts`).
    // Lo registra `main.tsx` solo en la app compilada: en `npm run dev` no existe.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      injectRegister: false,
      devOptions: { enabled: false },
      injectManifest: {
        // Todo lo que arma el build: HTML, JS (también los workers de PowerSync), CSS, los
        // WASM, los íconos y el manifest. Con esto guardado, la app abre sin conexión.
        globPatterns: ['**/*.{html,js,css,wasm,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: TOPE_POR_ARCHIVO,
        // Un script clásico, no un módulo: lo entienden todos los navegadores de tablet.
        rollupFormat: 'iife',
      },
      manifest: {
        name: 'Lavandería',
        short_name: 'Lavandería',
        description: 'Ingreso y entrega de ropa en el mostrador.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#1e40af',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    // Fijo y estricto: CLAUDE.md documenta el 5173, y con strictPort Vite falla en vez
    // de saltar a otro puerto en silencio y dejar el .env apuntando al sitio equivocado.
    port: 5173,
    strictPort: true,
  },
  // Lo que pide el SDK web de PowerSync (SPEC-KRILINXI-004), según su ejemplo oficial para
  // Vite. El paquete trae web workers y un SQLite en WASM: si Vite lo pre-empaqueta en
  // desarrollo, rompe las rutas a esos archivos. Y los workers tienen que ser módulos ES.
  optimizeDeps: {
    exclude: ['@powersync/web'],
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Los tests no leen el .env del desarrollador: si dependieran de él, pasarían o
    // fallarían según la máquina. El módulo de entorno se prueba con valores explícitos.
    env: { VITE_API_URL: 'http://localhost:4000', VITE_POWERSYNC_URL: 'http://localhost:8080' },
  },
});
