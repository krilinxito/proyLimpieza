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

/**
 * La entrega sin cobrar de una boleta REEMBOLSADA — SPEC-KRILINXI-070: por qué, quién la hizo y cuándo. `hechoPor` y
 * `fecha` pueden faltar si no se pueden leer (la cuenta no está en la tablet, o la fecha no se entiende). La fecha ya
 * viene escrita para leer y en la hora de Bolivia (`02/10/2026 16:30`), venga de la base local o de la API.
 */
export type Reembolso = {
  motivo: string;
  hechoPor: string | null;
  fecha: string | null;
};

/** La fecha de la API (`2026-10-02 16:30:00`, ya en Bolivia) → `02/10/2026 16:30`; null si no se entiende. */
export function fechaDelReembolsoDeLaApi(fecha: string): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(fecha);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]} ${partes[4]}` : null;
}

/**
 * Los pares del detalle de una boleta reembolsada: por qué salió sin cobrar, quién lo registró y cuándo —
 * SPEC-KRILINXI-070. Vacío si no es un reembolso. Los usan el detalle del Mostrador y el del historial del admin.
 */
export function paresDelReembolso(reembolso: Reembolso | null): [string, string][] {
  if (reembolso === null) return [];
  return [
    ['Motivo', reembolso.motivo],
    ['Lo registró', reembolso.hechoPor ?? '—'],
    ['Cuándo', reembolso.fecha ?? '—'],
  ];
}

/** Cómo se dice el retiro en el detalle de una boleta; el único lugar que lo redacta. */
export function textoDelRetiro(retiro: Retiro): string {
  if (retiro.tipo === 'CON_BOLETA') return 'Con la boleta';
  return [retiro.nombre, retiro.carnet].filter((parte) => parte).join(', ') || 'Sin datos';
}
