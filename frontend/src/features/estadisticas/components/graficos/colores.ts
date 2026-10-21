/**
 * Qué color lleva cada cosa en los gráficos — SPEC-KRILINXI-026. Los colores son tokens del tema
 * (`index.css`); acá solo se decide cuál va con qué.
 *
 * Las clases van escritas enteras a propósito: Tailwind solo genera las que encuentra literales en
 * el código, así que `fill-serie-${n}` no existiría. `marca` pinta la barra del SVG; `muestra`, el
 * cuadradito de la leyenda.
 */
import type { MetodoPago } from '../../../../lib/dominio';
import type { Tramo } from '../../types';

export type Color = { marca: string; muestra: string };

/**
 * Una serie por forma de pago, siempre en el orden de METODOS_PAGO: el efectivo es siempre el
 * azul, haya o no QR ese día. Que el color siga al método y no a su lugar es lo que permite
 * aprenderlo.
 */
export const COLOR_METODO: Record<MetodoPago, Color> = {
  EFECTIVO: { marca: 'fill-serie-1', muestra: 'bg-serie-1' },
  QR: { marca: 'fill-serie-2', muestra: 'bg-serie-2' },
  TARJETA: { marca: 'fill-serie-3', muestra: 'bg-serie-3' },
  TRANSFERENCIA: { marca: 'fill-serie-4', muestra: 'bg-serie-4' },
};

/**
 * El trazo de cada línea de un gráfico de líneas — SPEC-KRILINXI-044. Es el mismo color que la barra de esa
 * forma de pago (`COLOR_METODO`), pero como `stroke`: una línea se pinta con trazo, no con relleno. Los
 * puntos de la línea sí usan el relleno (`COLOR_METODO[m].marca`).
 */
export const TRAZO_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'stroke-serie-1',
  QR: 'stroke-serie-2',
  TARJETA: 'stroke-serie-3',
  TRANSFERENCIA: 'stroke-serie-4',
};

/** Las barras de una sola serie (la ropa de cada día, lo que recibió cada persona): un solo color. */
export const COLOR_UNICO: Color = COLOR_METODO.EFECTIVO;

/** La antigüedad es un orden, no una lista de cosas distintas: un solo tono que se oscurece. */
export const COLOR_TRAMO: Record<Tramo, Color> = {
  HASTA_7_DIAS: { marca: 'fill-antiguedad-1', muestra: 'bg-antiguedad-1' },
  DE_8_A_30_DIAS: { marca: 'fill-antiguedad-2', muestra: 'bg-antiguedad-2' },
  MAS_DE_30_DIAS: { marca: 'fill-antiguedad-3', muestra: 'bg-antiguedad-3' },
};
