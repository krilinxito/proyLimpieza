/**
 * Las cuentas del personal en la base local — SPEC-KRILINXI-017.
 *
 * `usuarios` baja por el bucket `global` sin `password_hash` (CLAUDE.md §7): leerlas de la
 * tablet no expone nada. Las escrituras van directo a la API (`cuentasApi.ts`).
 */
import { esRol } from '../../../lib/dominio';
import type { BaseLocal, Fila } from '../../../lib/powersync';
import type { Cuenta } from '../types';

function aCuenta({ id, nombre_completo, username, rol, sucursal_id, sucursal, activo }: Fila): Cuenta | null {
  if (typeof id !== 'string' || typeof nombre_completo !== 'string' || typeof username !== 'string' || !esRol(rol)) return null;
  return {
    id,
    nombreCompleto: nombre_completo,
    username,
    rol,
    sucursalId: typeof sucursal_id === 'string' ? sucursal_id : null,
    sucursal: typeof sucursal === 'string' ? sucursal : null,
    activo: activo === 1,
  };
}

/** Todas, las activas primero y después por nombre. En SQLite sí hay JOIN: el límite es de las sync rules. */
export async function listarCuentas(base: BaseLocal): Promise<Cuenta[]> {
  const filas = await base.consultar(
    `SELECT u.id, u.nombre_completo, u.username, u.rol, u.sucursal_id, s.nombre AS sucursal, u.activo
       FROM usuarios u LEFT JOIN sucursales s ON s.id = u.sucursal_id
      ORDER BY u.activo DESC, u.nombre_completo`,
  );
  return filas.map(aCuenta).filter((c): c is Cuenta => c !== null);
}
