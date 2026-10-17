/**
 * La política de seguridad del contenido (CSP) de la app compilada — SPEC-KRILINXI-020.
 *
 * La sesión vive en `localStorage` (SPEC-KRILINXI-003): un script ajeno que lograra correr en la
 * página podría leer el token y usarlo desde otro lado. La CSP le dice al navegador de dónde
 * puede venir cada cosa, y todo lo demás lo bloquea: aunque alguien consiguiera meter un
 * `<script>` en la página, no correría, y aunque corriera, no tendría a dónde mandar el token.
 *
 * Va como `<meta>` en `index.html` (lo inserta el plugin de abajo, solo al compilar) porque el
 * repo no tiene servidor web propio. Un `<meta>` no admite `frame-ancestors` ni avisos de
 * violación: cuando haya un servidor de producción, la política pasa a una cabecera HTTP
 * (CLAUDE.md §13).
 */
import type { Plugin } from 'vite';

/** Los dos servicios externos de la app. Si se agrega otro, va aquí y en la política. */
export type Servicios = { apiUrl: string; powersyncUrl: string };

/** "http://localhost:4000/api" → "http://localhost:4000". Una URL rota corta el build. */
function origen(url: string, nombre: string): string {
  try {
    return new URL(url).origin;
  } catch {
    throw new Error(`${nombre} no es una dirección válida ("${url}"): sin ella no se puede armar la política de seguridad.`);
  }
}

/** Las directivas, en el orden en que se escriben. */
export function directivas({ apiUrl, powersyncUrl }: Servicios): Record<string, string[]> {
  return {
    // Lo que no se nombra abajo, solo del propio sitio.
    'default-src': ["'self'"],
    // Ni scripts en línea ni eval: solo los archivos del build.
    'script-src': ["'self'"],
    // Ni estilos en línea: Tailwind compila a un archivo .css (las barras del volumen se dibujan
    // con clases, no con `style`).
    'style-src': ["'self'"],
    'img-src': ["'self'"],
    'font-src': ["'self'"],
    // Los workers de PowerSync salen de archivos del propio build.
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    // Con quién puede hablar la página: el sitio, la API y PowerSync (que en la web sincroniza por
    // HTTP, no por WebSocket). Nada más: un script ajeno no tendría a dónde mandar el token.
    'connect-src': ["'self'", origen(apiUrl, 'VITE_API_URL'), origen(powersyncUrl, 'VITE_POWERSYNC_URL')],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
}

export function politicaDeContenido(servicios: Servicios): string {
  return Object.entries(directivas(servicios))
    .map(([nombre, valores]) => `${nombre} ${[...new Set(valores)].join(' ')}`)
    .join('; ');
}

/**
 * Inserta la política en el `index.html` del build. Solo al compilar (`apply: 'build'`): en
 * `npm run dev`, Vite inyecta scripts en línea para la recarga en caliente y la política los
 * bloquearía.
 */
export function cspEnElBuild(): Plugin {
  let servicios: Servicios | null = null;
  return {
    name: 'lavanderia-csp',
    apply: 'build',
    configResolved(config) {
      const { VITE_API_URL, VITE_POWERSYNC_URL } = config.env;
      servicios = { apiUrl: String(VITE_API_URL ?? ''), powersyncUrl: String(VITE_POWERSYNC_URL ?? '') };
    },
    transformIndexHtml() {
      if (!servicios) throw new Error('La política de seguridad se arma después de leer la configuración.');
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: politicaDeContenido(servicios) },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
