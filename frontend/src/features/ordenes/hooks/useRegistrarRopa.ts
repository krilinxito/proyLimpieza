import { useMemo } from 'react';
import { useSession } from '../../../hooks/useSession';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { useBaseLocal } from '../../../lib/powersync';
import { registrarRopa, revisarRopa } from '../api/ordenesLocal';
import type { DatosRopa, ResultadoRegistro, RevisionDeRopa } from '../types';

export type RegistroRopa =
  /** La base local se está abriendo, o quien está adentro no trabaja en ninguna sucursal. */
  | { lista: false }
  | {
      lista: true;
      registrar: (datos: DatosRopa) => Promise<ResultadoRegistro>;
      /** Cómo va lo escrito, sin guardar: las mismas validaciones que `registrar` (SPEC-KRILINXI-058). */
      revisar: (datos: DatosRopa) => Promise<RevisionDeRopa>;
    };

/**
 * La puerta de la pantalla a "registrar ropa" (mismo patrón que `useClientes`, SPEC-KRILINXI-005).
 *
 * Además de la base, pone quién registra (de la sesión) y en qué sucursal (la de trabajo,
 * SPEC-KRILINXI-029): la pantalla no los elige ni los ve. Sin sucursal (un ADMIN que no está
 * atendiendo) no hay registro posible: la ruta ya no se lo deja abrir, y esto es la segunda línea.
 */
export function useRegistrarRopa(): RegistroRopa {
  const base = useBaseLocal();
  const { sesion } = useSession();
  const usuarioId = sesion?.usuario.id;
  const sucursalId = useSucursalDeTrabajo();

  return useMemo<RegistroRopa>(() => {
    if (!base || !usuarioId || !sucursalId) return { lista: false };
    const quien = { usuarioId, sucursalId };
    return {
      lista: true,
      registrar: (datos) => registrarRopa(base, quien, datos),
      revisar: (datos) => revisarRopa(base, quien, datos),
    };
  }, [base, usuarioId, sucursalId]);
}
