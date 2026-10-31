import { useMemo } from 'react';
import { useSession } from '../../../hooks/useSession';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { useBaseLocal } from '../../../lib/powersync';
import { prepararEntrega, prepararReembolso, registrarEntrega, registrarReembolso } from '../api/entregasLocal';
import type { DatosEntrega, DatosReembolso, ResultadoEntrega, ResultadoReembolso } from '../types';

export type Entregar =
  | { lista: false }
  | {
      lista: true;
      /** Valida sin escribir: para armar la confirmación. */
      preparar: (ordenId: string, datos: DatosEntrega) => Promise<ResultadoEntrega>;
      registrar: (ordenId: string, datos: DatosEntrega) => Promise<ResultadoEntrega>;
      /** Lo mismo para entregar sin cobrar (SPEC-KRILINXI-070). */
      prepararSinCobrar: (ordenId: string, datos: DatosReembolso) => Promise<ResultadoReembolso>;
      registrarSinCobrar: (ordenId: string, datos: DatosReembolso) => Promise<ResultadoReembolso>;
    };

/**
 * La puerta de la pantalla a la entrega — SPEC-KRILINXI-009. Pone la base, la sucursal de trabajo
 * (SPEC-KRILINXI-029) y, de la sesión, quién entrega.
 */
export function useEntregar(): Entregar {
  const base = useBaseLocal();
  const { sesion } = useSession();
  const usuarioId = sesion?.usuario.id;
  const sucursalId = useSucursalDeTrabajo();

  return useMemo<Entregar>(() => {
    if (!base || !usuarioId || !sucursalId) return { lista: false };
    return {
      lista: true,
      preparar: (ordenId, datos) => prepararEntrega(base, sucursalId, ordenId, datos),
      registrar: (ordenId, datos) => registrarEntrega(base, { usuarioId, sucursalId }, ordenId, datos),
      prepararSinCobrar: (ordenId, datos) => prepararReembolso(base, sucursalId, ordenId, datos),
      registrarSinCobrar: (ordenId, datos) => registrarReembolso(base, { usuarioId, sucursalId }, ordenId, datos),
    };
  }, [base, usuarioId, sucursalId]);
}
