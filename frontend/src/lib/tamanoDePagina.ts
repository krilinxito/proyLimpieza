/**
 * Cuántas filas entran en una página — SPEC-KRILINXI-041.
 *
 * **Ninguna lista larga se muestra de golpe, en ninguna parte de la interfaz**: se pagina (el
 * componente `Paginas`). Cuántas entran en cada página depende de la pantalla: en un celular, una
 * lista de 20 tarjetas obliga a bajar y bajar con el dedo; en una pantalla ancha, 6 serían pocas. Es
 * una regla del negocio de la interfaz y vive en un solo lugar, para que dos pantallas no la entiendan
 * distinto. Los cortes son los de Tailwind (`sm` = 640px y `lg` = 1024px), los mismos con que el resto
 * de la app cambia de forma (el menú, la grilla de Personal).
 */

/** Pantalla angosta (celular): lo que entra sin bajar demasiado. */
export const POR_PAGINA_ANGOSTA = 6;
/** Pantalla mediana (tablet vertical). */
export const POR_PAGINA_MEDIANA = 10;
/** Pantalla ancha, desde 1024px. */
export const POR_PAGINA_ANCHA = 20;

const DESDE_MEDIANA = 640;
const DESDE_ANCHA = 1024;

/** Cuántas filas entran por página en una pantalla de `ancho` píxeles. */
export function tamanoDePagina(ancho: number): number {
  if (ancho < DESDE_MEDIANA) return POR_PAGINA_ANGOSTA;
  if (ancho < DESDE_ANCHA) return POR_PAGINA_MEDIANA;
  return POR_PAGINA_ANCHA;
}
