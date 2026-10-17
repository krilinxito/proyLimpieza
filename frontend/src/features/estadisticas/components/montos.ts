import { desdeDecimal, formatearBs } from '../../../lib/money';

/** "125.50" del servidor → "Bs 125,50". Solo formatea: no suma ni redondea (CLAUDE.md §8). */
export function bs(monto: string): string {
  return formatearBs(desdeDecimal(monto));
}
