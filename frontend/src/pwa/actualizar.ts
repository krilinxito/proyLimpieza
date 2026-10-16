/**
 * Cuándo pasar a la versión nueva de la app — SPEC-KRILINXI-011.
 *
 * Cuando se publica una versión nueva, el navegador la baja por detrás y la deja **esperando**:
 * mientras la pantalla de ahora esté abierta, sigue mandando la versión vieja. Es a propósito.
 * La pantalla abierta cargó el JS viejo y todavía puede pedir pedazos que carga más tarde (la
 * base local, al entrar): si la versión nueva tomara el mando, esos pedazos viejos ya no
 * estarían y la pantalla se rompería a mitad del turno.
 *
 * El momento seguro es cuando la pantalla se va: al cerrar la app, o al recargarla. Cerrar
 * funciona solo. Recargar no, porque la página nueva nace antes de que la vieja muera y el
 * navegador nunca ve "cero pantallas". Por eso, al recargar, si esa es la única ventana, se
 * le dice a la versión que espera que tome el mando, y se responde con una página vacía que
 * pide recargar otra vez: esa segunda carga ya la atiende la versión nueva. Quien atiende no ve
 * más que una recarga un poco más larga, y la sesión (localStorage) y la base
 * local (SQLite) no se tocan: el service worker solo maneja su propia caché de archivos.
 */

/** El mensaje que la versión que espera entiende como "tomá el mando". */
export const TOMAR_EL_MANDO = 'TOMAR_EL_MANDO';

/**
 * Con una versión esperando, si se puede cambiar ya. Con otra ventana abierta no: esa ventana
 * sigue usando la versión vieja y se le caería lo que todavía tenga que cargar. Cambia cuando
 * quede una sola, la que está recargando.
 */
export function puedeTomarElMando(ventanasAbiertas: number): boolean {
  return ventanasAbiertas <= 1;
}

/**
 * Una página vacía que le pide al navegador cargar de nuevo la misma dirección, ya. Va por
 * las dos vías: la cabecera `Refresh` y la etiqueta `<meta>`, que es la que los navegadores
 * siguen siempre. Probado en Chromium con la app compilada: con la cabecera sola, y sin esperar
 * a que la versión nueva se active, la pantalla quedaba en blanco.
 */
export function respuestaQueRecarga(): Response {
  return new Response('<!doctype html><meta http-equiv="refresh" content="0">', {
    headers: { Refresh: '0', 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** Lo que hace falta de un `ServiceWorker` para esperar a que se active. */
export type VersionEsperando = Pick<ServiceWorker, 'state' | 'addEventListener' | 'removeEventListener'>;

/**
 * Espera a que la versión nueva termine de activarse, con un tope. Si se recargara antes, la
 * segunda carga la atendería todavía la versión vieja, que volvería a pedir recargar. Con el
 * tope, en el peor caso se recarga igual y la versión nueva entra en la carga siguiente.
 */
export function esperarQueSeActive(version: VersionEsperando, topeMs = 3000): Promise<void> {
  if (version.state === 'activated' || version.state === 'redundant') return Promise.resolve();
  return new Promise((listo) => {
    const terminar = () => {
      clearTimeout(reloj);
      version.removeEventListener('statechange', alCambiar);
      listo();
    };
    const alCambiar = () => {
      if (version.state === 'activated' || version.state === 'redundant') terminar();
    };
    const reloj = setTimeout(terminar, topeMs);
    version.addEventListener('statechange', alCambiar);
  });
}

export function esPedidoDeTomarElMando(datos: unknown): boolean {
  return typeof datos === 'object' && datos !== null && 'tipo' in datos && datos.tipo === TOMAR_EL_MANDO;
}
