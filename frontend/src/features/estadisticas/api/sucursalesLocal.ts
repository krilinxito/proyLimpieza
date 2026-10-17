/**
 * Las sucursales para el filtro del panel, de la base local — SPEC-KRILINXI-015.
 *
 * El catálogo de sucursales sí se lee de la tablet: baja entero por el bucket `global`, también
 * para el admin (CLAUDE.md §7). Lo que va por la API son las métricas (`estadisticasApi.ts`).
 * Es el único archivo de la feature que toca la base local, y el test de arquitectura lo
 * permite solo a él.
 */
import type { BaseLocal } from '../../../lib/powersync';
import type { SucursalElegible } from '../types';

/** Las abiertas, por nombre. Una cerrada no tiene caja que mirar en el día a día. */
export async function listarSucursales(base: BaseLocal): Promise<SucursalElegible[]> {
  const filas = await base.consultar('SELECT id, nombre FROM sucursales WHERE activa = 1 ORDER BY nombre');
  return filas.flatMap(({ id, nombre }) => (typeof id === 'string' && typeof nombre === 'string' ? [{ id, nombre }] : []));
}
