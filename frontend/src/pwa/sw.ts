/**
 * El service worker de la app — SPEC-KRILINXI-011.
 *
 * Un service worker es un script que el navegador instala aparte de la página y que se pone
 * en el medio de cada pedido que ella hace. Este hace tres cosas, y nada más:
 *
 *  1. Precache: guarda en el dispositivo todos los archivos de la app (HTML, JS, CSS, y los
 *     WASM y workers del SQLite de PowerSync), con la lista que arma el build. Así la app
 *     abre sin internet.
 *  2. Abrir cualquier pantalla (`/ropa`, `/cobrar`…) devuelve el `index.html` guardado: ver
 *     `navegacion.ts`.
 *  3. Pasar a una versión nueva solo cuando es seguro: ver `actualizar.ts`.
 *
 * Todo lo demás —la API, PowerSync— no lo toca: si ninguna regla lo reclama, el pedido va a la
 * red como si el service worker no existiera.
 *
 * No se compila con el resto de la app: lo arma vite-plugin-pwa aparte (`vite.config.ts`),
 * y en su lugar pone la lista de archivos donde dice `self.__WB_MANIFEST`.
 */
import { addRoute, createHandlerBoundToURL, precache, type PrecacheEntry } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { direccionesDeServidores, entorno } from '../lib/env';
import { esperarQueSeActive, esPedidoDeTomarElMando, puedeTomarElMando, respuestaQueRecarga, TOMAR_EL_MANDO } from './actualizar';
import { esPantallaDeLaApp } from './navegacion';

// El tsconfig de la app es para páginas (lib DOM), no para service workers. En vez de mezclar
// las dos librerías de tipos, que chocan, se declara aquí lo poco que se usa del `self` de un
// service worker.
declare const self: {
  __WB_MANIFEST: (string | PrecacheEntry)[];
  location: Location;
  registration: ServiceWorkerRegistration;
  clients: { matchAll: (opciones: { type: 'window' }) => Promise<readonly unknown[]> };
  skipWaiting: () => Promise<void>;
  addEventListener: (tipo: 'message', escuchar: (evento: MessageEvent) => void) => void;
};

// Primero se anota la lista (para que `index.html` exista en la caché), pero la ruta que la
// sirve se agrega al final: Workbox prueba las rutas en orden, y la del precache también
// atiende `/`. Si fuera primero, recargar en la pantalla de inicio se saltaría el cambio de
// versión de abajo.
precache(self.__WB_MANIFEST);

const index = createHandlerBoundToURL('index.html');
// Los servidores con los que habla la app. El service worker no les pide nada: solo necesita saber de qué no ocuparse.
const servidores = direccionesDeServidores(entorno);

registerRoute(
  ({ request }) => esPantallaDeLaApp(request, self.location.origin, servidores),
  async (opciones) => {
    const esperando = self.registration.waiting;
    const ventanas = await self.clients.matchAll({ type: 'window' });
    if (esperando && puedeTomarElMando(ventanas.length)) {
      esperando.postMessage({ tipo: TOMAR_EL_MANDO });
      await esperarQueSeActive(esperando);
      return respuestaQueRecarga();
    }
    return index(opciones);
  },
);

addRoute();

self.addEventListener('message', (evento) => {
  if (esPedidoDeTomarElMando(evento.data)) void self.skipWaiting();
});
