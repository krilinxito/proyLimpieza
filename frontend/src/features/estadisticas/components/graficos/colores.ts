/**
 * Qué color lleva cada cosa en los gráficos — SPEC-KRILINXI-026. Los colores son tokens del tema
 * (`index.css`); acá solo se decide cuál va con qué.
 *
 * Las clases van escritas enteras a propósito: Tailwind solo genera las que encuentra literales en
 * el código, así que `fill-serie-${n}` no existiría. `marca` pinta la barra del SVG; `muestra`, el
 * cuadradito de la leyenda; `trazo`, la línea de un gráfico de líneas (SPEC-KRILINXI-063: Recharts
 * pinta con `currentColor`, y el color sale de la clase `text-…`, sin escribir ningún `style`).
 */
import type { MetodoPago } from '../../../../lib/dominio';
import type { Tramo } from '../../types';

export type Color = { marca: string; muestra: string; trazo: string };

/**
 * Una serie por forma de pago, siempre en el orden de METODOS_PAGO: el efectivo es siempre el
 * azul, haya o no QR ese día. Que el color siga al método y no a su lugar es lo que permite
 * aprenderlo. Es la paleta de las dos tarjetas que cuentan formas de pago (SPEC-KRILINXI-063).
 */
export const COLOR_METODO: Record<MetodoPago, Color> = {
  EFECTIVO: { marca: 'fill-serie-1', muestra: 'bg-serie-1', trazo: 'text-serie-1' },
  QR: { marca: 'fill-serie-2', muestra: 'bg-serie-2', trazo: 'text-serie-2' },
  TARJETA: { marca: 'fill-serie-3', muestra: 'bg-serie-3', trazo: 'text-serie-3' },
};

/**
 * El matiz propio de cada tarjeta de una sola serie — SPEC-KRILINXI-063 (la caja, la ropa recibida, lo
 * que hizo cada persona, los clientes). Un matiz por tarjeta, y distintos entre los vecinos del tablero.
 */
export const COLOR_TARJETA = {
  caja: { marca: 'fill-caja', muestra: 'bg-caja', trazo: 'text-caja' },
  ropa: { marca: 'fill-ropa', muestra: 'bg-ropa', trazo: 'text-ropa' },
  personas: { marca: 'fill-personas', muestra: 'bg-personas', trazo: 'text-personas' },
  clientes: { marca: 'fill-clientes', muestra: 'bg-clientes', trazo: 'text-clientes' },
} as const satisfies Record<string, Color>;

type ColorDeBarra = { marca: string; muestra: string };

/** La antigüedad de la ropa sin recoger es un orden, no una lista de cosas distintas: un solo tono azul que se oscurece. */
export const COLOR_TRAMO: Record<Tramo, ColorDeBarra> = {
  HASTA_7_DIAS: { marca: 'fill-antiguedad-1', muestra: 'bg-antiguedad-1' },
  DE_8_A_30_DIAS: { marca: 'fill-antiguedad-2', muestra: 'bg-antiguedad-2' },
  MAS_DE_30_DIAS: { marca: 'fill-antiguedad-3', muestra: 'bg-antiguedad-3' },
};

/** Lo mismo para lo que se debe (SPEC-KRILINXI-063): su propia rampa, de rosa, para no confundirse con la ropa. */
export const COLOR_TRAMO_DEUDA: Record<Tramo, ColorDeBarra> = {
  HASTA_7_DIAS: { marca: 'fill-deuda-1', muestra: 'bg-deuda-1' },
  DE_8_A_30_DIAS: { marca: 'fill-deuda-2', muestra: 'bg-deuda-2' },
  MAS_DE_30_DIAS: { marca: 'fill-deuda-3', muestra: 'bg-deuda-3' },
};
