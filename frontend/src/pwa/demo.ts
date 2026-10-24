/**
 * La demo para el cliente con un solo túnel — SPEC-KRILINXI-064.
 *
 * Para que el cliente pruebe la app desde su equipo antes de hostearla, se publica UNA dirección
 * (la de ngrok) y el servidor de la app compilada (`vite preview`) reparte los pedidos:
 *
 *   https://<dominio>.ngrok-free.app/            → los archivos de la app
 *   https://<dominio>.ngrok-free.app/api/…       → el backend (:4000)
 *   https://<dominio>.ngrok-free.app/powersync/… → PowerSync (:8080), sin el prefijo
 *
 * Con un solo origen no hay CORS que abrir y la política de seguridad sigue siendo `'self'`.
 * Todo lo que decide eso vive aquí, en funciones puras, para poder probarlo sin ngrok.
 */
import type { ProxyOptions } from 'vite';

/** Dónde corren hoy el backend y PowerSync (los puertos de `.env.example`). */
export type Destinos = { backend: string; powersync: string };

export const DESTINOS_POR_DEFECTO: Destinos = { backend: 'http://localhost:4000', powersync: 'http://localhost:8080' };

/** Con qué prefijo se publica PowerSync en la dirección pública. */
export const PREFIJO_POWERSYNC = '/powersync';

const COMO_SE_PIDE =
  'Ejemplo: DEMO_URL_PUBLICA=https://mi-demo.ngrok-free.app npm run demo';

/**
 * La dirección pública que se pasó, limpia: solo el origen (`https://dominio`), sin barra ni ruta.
 * Falla con un mensaje que dice qué falta: compilar sin ella dejaría una app apuntando a localhost,
 * que en el equipo del cliente no existe.
 */
export function leerDireccionPublica(valor: string | undefined): string {
  const texto = valor?.trim();
  if (!texto) {
    throw new Error(`Falta la dirección pública de la demo, la que te da ngrok. ${COMO_SE_PIDE}`);
  }
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new Error(`"${texto}" no es una dirección válida. Copia la que te da ngrok, completa. ${COMO_SE_PIDE}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `La dirección de la demo tiene que empezar con https:// (la app instalable y sin internet lo necesita). ${COMO_SE_PIDE}`,
    );
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`La dirección de la demo no lleva ruta, solo el dominio (por ejemplo ${url.origin}). ${COMO_SE_PIDE}`);
  }
  return url.origin;
}

/** Las dos variables con las que se compila la app para la demo: todo sale por la misma dirección. */
export function entornoDeLaDemo(publica: string): { VITE_API_URL: string; VITE_POWERSYNC_URL: string } {
  return { VITE_API_URL: publica, VITE_POWERSYNC_URL: `${publica}${PREFIJO_POWERSYNC}` };
}

/**
 * La parte `preview` de la configuración de Vite: qué dominio se acepta y a dónde va cada ruta.
 * `allowedHosts` es solo el dominio de ngrok (Vite siempre deja pasar localhost): una petición con
 * otro `Host` se rechaza, así que el servidor no queda abierto a cualquier nombre.
 */
export function previewDeLaDemo(
  publica: string,
  destinos: Destinos = DESTINOS_POR_DEFECTO,
): { allowedHosts: string[]; proxy: Record<string, ProxyOptions> } {
  return {
    allowedHosts: [new URL(publica).hostname],
    proxy: {
      '/api/': { target: destinos.backend, changeOrigin: true },
      [`${PREFIJO_POWERSYNC}/`]: {
        target: destinos.powersync,
        changeOrigin: true,
        rewrite: (ruta) => ruta.slice(PREFIJO_POWERSYNC.length),
      },
    },
  };
}
