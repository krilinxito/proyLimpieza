/**
 * Instalar el service worker en el navegador — SPEC-KRILINXI-011.
 *
 * Solo en la app compilada (`npm run build`). En `npm run dev` un service worker sería una
 * trampa: guardaría una versión del código y la seguiría sirviendo después de cada cambio,
 * así que lo que se ve en pantalla no sería lo que está en el editor. En los tests tampoco:
 * jsdom no tiene service workers.
 */

/** Lo que hace falta del navegador; `navigator` cumple esta forma. */
export type Navegador = {
  serviceWorker?: { register: (url: string, opciones: { scope: string }) => Promise<unknown> };
};

type Opciones = {
  /** `import.meta.env.PROD`: true solo en la app compilada. */
  produccion: boolean;
  navegador: Navegador;
  /** `import.meta.env.BASE_URL`: dónde está publicada la app, normalmente `/`. */
  base: string;
};

export async function registrarServiceWorker({ produccion, navegador, base }: Opciones): Promise<void> {
  if (!produccion || !navegador.serviceWorker) return;
  try {
    await navegador.serviceWorker.register(`${base}sw.js`, { scope: base });
  } catch (error) {
    // Sin service worker la app funciona igual con internet; lo que se pierde es abrirla sin
    // conexión. No es motivo para tumbar la pantalla.
    console.error('No se pudo preparar la app para abrir sin internet.', error);
  }
}
