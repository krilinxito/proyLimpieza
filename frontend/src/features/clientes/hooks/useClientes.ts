import { useMemo } from 'react';
import { useBaseLocal } from '../../../lib/powersync';
import { buscarPorTelefono, registrarCliente } from '../api/clientesLocal';
import type { Cliente, DatosAlta, ResultadoAlta } from '../types';

export type Clientes =
  /** La base local se está abriendo: es un instante al entrar. */
  | { lista: false }
  | {
      lista: true;
      buscar: (telefono: string) => Promise<Cliente | null>;
      registrar: (datos: DatosAlta) => Promise<ResultadoAlta>;
    };

/**
 * La puerta de las pantallas a los clientes. Saca la base local del contexto y se la pasa
 * a `api/clientesLocal`, que es quien sabe SQL; la pantalla solo ve `buscar` y `registrar`
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
          }
        : { lista: false },
    [base],
  );
}
