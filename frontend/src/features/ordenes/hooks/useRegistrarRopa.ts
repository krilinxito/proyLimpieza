import { useMemo } from 'react';
import { useSession } from '../../../hooks/useSession';
import { useBaseLocal } from '../../../lib/powersync';
import { registrarRopa } from '../api/ordenesLocal';
import type { DatosRopa, ResultadoRegistro } from '../types';

export type RegistroRopa =
  /** La base local se está abriendo, o quien está adentro no tiene sucursal. */
  | { lista: false }
  | { lista: true; registrar: (datos: DatosRopa) => Promise<ResultadoRegistro> };

/**
 * La puerta de la pantalla a "registrar ropa" (mismo patrón que `useClientes`, SPEC-KRILINXI-005).
 *
 * Además de la base, pone quién registra y en qué sucursal, sacados de la sesión: la
 * pantalla no los elige ni los ve. Sin sucursal (un ADMIN) no hay registro posible: la
 * ruta ya no se lo deja abrir, y esto es la segunda línea.
 */
export function useRegistrarRopa(): RegistroRopa {
  const base = useBaseLocal();
  const { sesion } = useSession();
  const usuarioId = sesion?.usuario.id;
  const sucursalId = sesion?.usuario.sucursalId;

  return useMemo<RegistroRopa>(() => {
    if (!base || !usuarioId || !sucursalId) return { lista: false };
    return { lista: true, registrar: (datos) => registrarRopa(base, { usuarioId, sucursalId }, datos) };
  }, [base, usuarioId, sucursalId]);
}
