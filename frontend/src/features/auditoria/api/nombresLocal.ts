/**
 * Los nombres de los clientes de una página de la auditoría, de la base local — SPEC-KRILINXI-018.
 *
 * Los clientes bajan enteros por el bucket `global`, también al admin: se pueden nombrar sin
 * pedirlos a la API. Se buscan solo los de la página que se muestra, no la tabla entera.
 */
import type { BaseLocal } from '../../../lib/powersync';

export async function nombresDeClientes(base: BaseLocal, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const filas = await base.consultar(`SELECT id, nombre FROM clientes WHERE id IN (${ids.map(() => '?').join(', ')})`, [...ids]);
  return new Map(filas.flatMap(({ id, nombre }) => (typeof id === 'string' && typeof nombre === 'string' ? [[id, nombre] as const] : [])));
}
