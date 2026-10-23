import type { TipoRetiro } from '../../lib/dominio';

/**
 * Quién se llevó la ropa — SPEC-KRILINXI-060. Existe solo si la boleta se entregó. El nombre y el
 * carnet solo vienen cuando fue SIN_BOLETA: el schema los exige en ese caso y no en el otro.
 */
export type Retiro = {
  tipo: TipoRetiro;
  nombre: string | null;
  carnet: string | null;
};

/** Cómo se dice el retiro en el detalle de una boleta; el único lugar que lo redacta. */
export function textoDelRetiro(retiro: Retiro): string {
  if (retiro.tipo === 'CON_BOLETA') return 'Con la boleta';
  return [retiro.nombre, retiro.carnet].filter((parte) => parte).join(', ') || 'Sin datos';
}
