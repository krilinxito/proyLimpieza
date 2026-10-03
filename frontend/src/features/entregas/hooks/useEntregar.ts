import { useMemo } from 'react';
import { useSession } from '../../../hooks/useSession';
import { useBaseLocal } from '../../../lib/powersync';
import { prepararEntrega, registrarEntrega } from '../api/entregasLocal';
import type { DatosEntrega, ResultadoEntrega } from '../types';

export type Entregar =
  | { lista: false }
  | {
      lista: true;
      /** Valida sin escribir: para armar la confirmación. */
      preparar: (ordenId: string, datos: DatosEntrega) => Promise<ResultadoEntrega>;
      registrar: (ordenId: string, datos: DatosEntrega) => Promise<ResultadoEntrega>;
    };

/** La puerta de la pantalla a la entrega — SPEC-KRILINXI-009. Pone la base y, de la sesión, quién entrega. */
export function useEntregar(): Entregar {
  const base = useBaseLocal();
  const { sesion } = useSession();
  const usuarioId = sesion?.usuario.id;
  const sucursalId = sesion?.usuario.sucursalId;

  return useMemo<Entregar>(() => {
    if (!base || !usuarioId || !sucursalId) return { lista: false };
    return {
      lista: true,
      preparar: (ordenId, datos) => prepararEntrega(base, sucursalId, ordenId, datos),
      registrar: (ordenId, datos) => registrarEntrega(base, { usuarioId, sucursalId }, ordenId, datos),
    };
  }, [base, usuarioId, sucursalId]);
}
