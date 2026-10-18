import { desdeDecimal, formatearBs } from '../../../lib/money';

/** "125.50" del servidor → "Bs 125,50". Solo formatea: no suma ni redondea (CLAUDE.md §8). */
export function bs(monto: string): string {
  return formatearBs(desdeDecimal(monto));
}

/** Los plurales del panel, en un solo lugar (SPEC-KRILINXI-026: los usan las secciones y sus gráficos). */
export const boletas = (n: number) => (n === 1 ? '1 boleta' : `${n} boletas`);
export const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`);
export const veces = (n: number) => (n === 1 ? '1 vez' : `${n} veces`);
