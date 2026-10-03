import { useMemo } from 'react';
import { useSession } from '../../../hooks/useSession';
import type { EstadoOrden, MetodoPago } from '../../../lib/dominio';
import { useBaseLocal } from '../../../lib/powersync';
import { buscarOrdenes, cambiarEstado, cobrar, listarAbiertas, obtenerOrden } from '../api/ropaLocal';
import type { OrdenVista, ResultadoAccion } from '../types';

export type Ropa =
  | { lista: false }
  | {
      lista: true;
      abiertas: () => Promise<OrdenVista[]>;
      buscar: (texto: string) => Promise<OrdenVista[]>;
      obtener: (ordenId: string) => Promise<OrdenVista | null>;
      cambiarEstado: (ordenId: string, destino: EstadoOrden) => Promise<ResultadoAccion>;
      cobrar: (ordenId: string, datos: { monto: string; metodo: MetodoPago | null }) => Promise<ResultadoAccion>;
    };

/**
 * La puerta de las pantallas a la ropa de la sucursal — SPEC-KRILINXI-008. Pone la base
 * local y, de la sesión, la sucursal y quién cobra: la pantalla no los ve ni los elige.
 */
export function useRopa(): Ropa {
  const base = useBaseLocal();
  const { sesion } = useSession();
  const usuarioId = sesion?.usuario.id;
  const sucursalId = sesion?.usuario.sucursalId;

  return useMemo<Ropa>(() => {
    if (!base || !usuarioId || !sucursalId) return { lista: false };
    return {
      lista: true,
      abiertas: () => listarAbiertas(base, sucursalId),
      buscar: (texto) => buscarOrdenes(base, sucursalId, texto),
      obtener: (ordenId) => obtenerOrden(base, sucursalId, ordenId),
      cambiarEstado: (ordenId, destino) => cambiarEstado(base, sucursalId, ordenId, destino),
      cobrar: (ordenId, datos) => cobrar(base, { usuarioId, sucursalId }, ordenId, datos),
    };
  }, [base, usuarioId, sucursalId]);
}
