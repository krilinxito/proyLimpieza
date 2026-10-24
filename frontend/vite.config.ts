import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cspEnElBuild } from './src/pwa/csp';
import { leerDireccionPublica, previewDeLaDemo } from './src/pwa/demo';
import paquete from './package.json' with { type: 'json' };

// Los WASM del SQLite de PowerSync pesan hasta 2,5 MB, y Workbox por defecto no guarda nada
// de más de 2 MiB. Sin subir el tope, la app abriría sin internet pero la base local no.
const TOPE_POR_ARCHIVO = 5 * 1024 * 1024;

export default defineConfig({
  // La versión de la app, para el pie (SPEC-KRILINXI-023). Vite reemplaza el nombre por el texto
  // al compilar, igual en los tests: se lee en `src/pages/version.ts`.
  define: { __VERSION_APP__: JSON.stringify(paquete.version) },
  plugins: [
    react(),
    tailwindcss(),
    // La política de seguridad del contenido, solo en la app compilada (SPEC-KRILINXI-020).
    cspEnElBuild(),
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
        // WASM, los íconos, el manifest y la letra (SPEC-KRILINXI-022). Con esto guardado, la app
        // abre sin conexión, y con su letra: sin el woff2, sin internet caería a la del sistema.
        globPatterns: ['**/*.{html,js,css,wasm,png,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: TOPE_POR_ARCHIVO,
        // Un script clásico, no un módulo: lo entienden todos los navegadores de tablet.
        rollupFormat: 'iife',
      },
      manifest: {
        // Una identidad fija para la app instalada: si algún día cambia start_url, sigue siendo la misma app (SPEC-KRILINXI-059).
        id: '/',
        name: 'Lavandería',
        short_name: 'Lavandería',
        description: 'Ingreso y entrega de ropa en el mostrador.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        // Los dos, el turquesa de la marca (`--color-marca`, SPEC-KRILINXI-052): la barra del sistema y la pantalla de arranque
        // de la app instalada. El ícono lleva el mismo fondo, así el arranque no tiene costuras. `src/pwa/iconos.test.ts` vigila
        // que sigan siendo iguales a `index.css`.
        background_color: '#0f766e',
        theme_color: '#0f766e',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // La demo para el cliente (SPEC-KRILINXI-064): `npm run demo` pone DEMO_URL_PUBLICA, y el servidor de la app
  // compilada reparte /api y /powersync detrás de una sola dirección. Sin la variable, `vite preview` es el de siempre.
  preview: process.env.DEMO_URL_PUBLICA
    ? { port: 4173, strictPort: true, ...previewDeLaDemo(leerDireccionPublica(process.env.DEMO_URL_PUBLICA)) }
    : {},
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
    // La zona horaria es la de las tablets (SPEC-KRILINXI-035): una fecha guardada sin zona leída como
    // hora local estaría corrida cuatro horas, y ese error solo se ve si la máquina NO está en UTC. Así
    // los tests lo atrapan igual en cualquier máquina, también en un servidor de CI en UTC.
    env: { VITE_API_URL: 'http://localhost:4000', VITE_POWERSYNC_URL: 'http://localhost:8080', TZ: 'America/La_Paz' },
    // La mitad de los núcleos, no todos (SPEC-KRILINXI-019). Cada archivo de pantalla abre su
    // propio SQLite y monta la App entera; con un proceso por núcleo, la primera lectura de la
    // base local a veces pasaba el tope de 1 s de `findBy…` y el test fallaba sin estar mal (la
    // mitad de las corridas completas, en una máquina de 16 núcleos). Con la mitad: 0 de 8, y la
    // suite tarda casi lo mismo, porque esos procesos de más solo competían por la CPU. Es mejor
    // que subir los tiempos de espera: un test que espera lo que no corresponde sigue fallando.
    maxWorkers: '50%',
    // Dos grupos que corren uno detrás del otro (SPEC-KRILINXI-011). El test del build compila
    // la app entera con todos los núcleos; si corriera a la vez que los de pantalla, les robaría
    // CPU y a los que esperan un texto con el tope de 1 s se les acabaría el tiempo.
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          exclude: [...configDefaults.exclude, 'src/pwa/build.test.ts'],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: { name: 'build', include: ['src/pwa/build.test.ts'], sequence: { groupOrder: 1 } },
      },
    ],
  },
});
