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
