/**
 * Las sucursales en la base local — SPEC-KRILINXI-017.
 *
 * Se leen de la tablet: bajan enteras por el bucket `global`, también para el admin (CLAUDE.md
 * §7). Las escrituras, en cambio, van directo a la API (`sucursalesApi.ts`).
 */
import type { BaseLocal, Fila } from '../../../lib/powersync';
import type { Sucursal } from '../types';

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

function aSucursal({ id, nombre, direccion, telefono, activa }: Fila): Sucursal | null {
  if (typeof id !== 'string' || typeof nombre !== 'string') return null;
  // BOOLEAN llega de Postgres como 0 o 1 (`lib/powersync/schema.ts`).
  return { id, nombre, direccion: texto(direccion), telefono: texto(telefono), activa: activa === 1 };
}

/** Todas, las abiertas primero y después por nombre. */
export async function listarSucursales(base: BaseLocal): Promise<Sucursal[]> {
  const filas = await base.consultar(
    'SELECT id, nombre, direccion, telefono, activa FROM sucursales ORDER BY activa DESC, nombre',
  );
  return filas.map(aSucursal).filter((s): s is Sucursal => s !== null);
}

/**
 * Cuántas personas trabajan en cada sucursal: las cuentas activas asignadas a ella — SPEC-KRILINXI-039.
 * Una dada de baja ya no trabaja ahí, y un ADMIN no tiene sucursal. Las que no aparecen tienen 0.
 */
export async function personasPorSucursal(base: BaseLocal): Promise<Map<string, number>> {
  const filas = await base.consultar(
    `SELECT sucursal_id, COUNT(*) AS personas FROM usuarios
      WHERE activo = 1 AND sucursal_id IS NOT NULL GROUP BY sucursal_id`,
  );
  const cuantas = new Map<string, number>();
  for (const { sucursal_id, personas } of filas) {
    if (typeof sucursal_id === 'string' && typeof personas === 'number') cuantas.set(sucursal_id, personas);
  }
  return cuantas;
}
