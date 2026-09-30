import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
