/**
 * Qué atiende el service worker — SPEC-KRILINXI-011.
 *
 * Una PWA de una sola página tiene un solo HTML: `/ropa`, `/cobrar` o `/clientes` no existen
 * como archivos, los dibuja React Router en el navegador. Con internet, el servidor de
 * archivos devuelve `index.html` para cualquiera de ellas. Sin internet no hay servidor, así
 * que tiene que hacerlo el service worker, sacando `index.html` de su caché.
 *
 * Pero solo para las pantallas de la app. Lo de la API y PowerSync va siempre a la red: un dato
 * del servidor guardado en una caché sería un dato viejo que parece nuevo (CLAUDE.md §6: lo
 * que se lee sin internet sale de SQLite, no de una caché del navegador).
 */

/** Lo mínimo de un pedido que hace falta para decidir. `Request` cumple esta forma. */
export type Pedido = { url: string; mode: string };

/**
 * Si este pedido es abrir una pantalla de la app. `servidores` son las direcciones de la API y
 * de PowerSync: aunque compartieran el dominio de la app (detrás de un mismo proxy, en
 * producción), lo que empieza con ellas no es una pantalla.
 */
export function esPantallaDeLaApp(pedido: Pedido, origenDeLaApp: string, servidores: readonly string[]): boolean {
  if (pedido.mode !== 'navigate') return false;
  const url = new URL(pedido.url);
  if (url.origin !== origenDeLaApp) return false;
  return !servidores.some((servidor) => esDe(url, servidor));
}

function esDe(url: URL, servidor: string): boolean {
  const base = new URL(servidor);
  if (url.origin !== base.origin) return false;
  const ruta = base.pathname.replace(/\/+$/, '');
  return ruta === '' || url.pathname === ruta || url.pathname.startsWith(`${ruta}/`);
}
