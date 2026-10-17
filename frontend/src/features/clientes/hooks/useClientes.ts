import { useMemo } from 'react';
import { useBaseLocal } from '../../../lib/powersync';
import { buscarPorTelefono, editarCliente, registrarCliente } from '../api/clientesLocal';
import type { Cliente, DatosAlta, DatosEdicion, ResultadoAlta, ResultadoEdicion } from '../types';

export type Clientes =
  /** La base local se está abriendo: es un instante al entrar. */
  | { lista: false }
  | {
      lista: true;
      buscar: (telefono: string) => Promise<Cliente | null>;
      registrar: (datos: DatosAlta) => Promise<ResultadoAlta>;
      /** Cambiar nombre o teléfono (SPEC-KRILINXI-014). */
      editar: (cliente: Cliente, datos: DatosEdicion) => Promise<ResultadoEdicion>;
    };

/**
 * La puerta de las pantallas a los clientes. Saca la base local del contexto y se la pasa
 * a `api/clientesLocal`, que es quien sabe SQL; la pantalla solo ve `buscar`, `registrar` y `editar`
 * (CLAUDE.md §5).
 */
export function useClientes(): Clientes {
  const base = useBaseLocal();
  return useMemo<Clientes>(
    () =>
      base
        ? {
            lista: true,
            buscar: (telefono) => buscarPorTelefono(base, telefono),
            registrar: (datos) => registrarCliente(base, datos),
            editar: (cliente, datos) => editarCliente(base, cliente, datos),
          }
        : { lista: false },
    [base],
  );
}
