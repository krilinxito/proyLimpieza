import { useSession } from '../../../hooks/useSession';

/**
 * En qué sucursal trabaja quien está adentro — SPEC-KRILINXI-029. **El único lugar** de donde
 * la sacan el mostrador y la cabecera:
 *
 *  - un EMPLEADO, en la suya, la asignada (CLAUDE.md §3);
 *  - un ADMIN, en la que eligió con "Atender en una sucursal", o en ninguna (null).
 *
 * Ninguna pantalla lee `usuario.sucursalId` de la sesión por su cuenta (lo vigila
 * `test/arquitectura.test.ts`): si lo hiciera, el ADMIN que atiende quedaría sin sucursal ahí.
 */
export function useSucursalDeTrabajo(): string | null {
  const { sesion, atencion } = useSession();
  if (!sesion) return null;
  return sesion.usuario.rol === 'ADMIN' ? atencion : sesion.usuario.sucursalId;
}
