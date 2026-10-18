import { useMemo } from 'react';
import type { ResultadosDeBusqueda } from '../../../lib/texto';
import { useBaseLocal } from '../../../lib/powersync';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { obtenerCliente } from '../../clientes/api/clientesLocal';
import type { Cliente } from '../../clientes/types';
import { listarAbiertas, ropaDelCliente } from '../../ordenes/api/ropaLocal';
import type { OrdenVista } from '../../ordenes/types';
import { buscarEnMostrador } from '../api/mostradorLocal';
import type { Encontrado } from '../types';

export type Mostrador =
  /** La base local se está abriendo, o quien está adentro no trabaja en ninguna sucursal. */
  | { lista: false }
  | {
      lista: true;
      buscar: (texto: string) => Promise<ResultadosDeBusqueda<Encontrado>>;
      /** La ropa en el local, para cuando no se busca nada. */
      enElLocal: () => Promise<OrdenVista[]>;
      cliente: (clienteId: string) => Promise<Cliente | null>;
      ropaDe: (clienteId: string) => Promise<OrdenVista[]>;
    };

/**
 * La puerta del Mostrador a la base local — SPEC-KRILINXI-033. Lo que se lee es de la sucursal de
 * trabajo (`useSucursalDeTrabajo`, SPEC-KRILINXI-029): la pantalla no la ve ni la elige. Las
 * acciones sobre cada boleta (avanzar, cobrar, entregar, anular) no pasan por acá: las hace el
 * detalle de la boleta con sus propios hooks (`useRopa`, `useEntregar`), como siempre.
 */
export function useMostrador(): Mostrador {
  const base = useBaseLocal();
  const sucursalId = useSucursalDeTrabajo();

  return useMemo<Mostrador>(() => {
    if (!base || !sucursalId) return { lista: false };
    return {
      lista: true,
      buscar: (texto) => buscarEnMostrador(base, sucursalId, texto),
      enElLocal: () => listarAbiertas(base, sucursalId),
      cliente: (clienteId) => obtenerCliente(base, clienteId),
      ropaDe: (clienteId) => ropaDelCliente(base, sucursalId, clienteId),
    };
  }, [base, sucursalId]);
}
