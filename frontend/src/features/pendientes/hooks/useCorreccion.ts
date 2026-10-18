import { useMemo } from 'react';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { useBaseLocal } from '../../../lib/powersync';
import { buscarMismoCliente, descartarRegistro, guardarCorreccion, usarMismoCliente } from '../api/corregirLocal';
import type { Cliente } from '../../clientes/types';
import type { ResultadoCorreccion } from '../correccion';
import type { RegistroParaCorregir } from '../types';

export type Correcciones =
  /** La base local se está abriendo. */
  | { lista: false }
  | {
      lista: true;
      guardar: (registro: RegistroParaCorregir, valores: Record<string, string>) => Promise<ResultadoCorreccion>;
      descartar: (registro: RegistroParaCorregir) => Promise<void>;
      /** SPEC-KRILINXI-021: el cliente que ya existe con el teléfono de uno rechazado, o null. */
      buscarMismoCliente: (registro: RegistroParaCorregir) => Promise<Cliente | null>;
      /** SPEC-KRILINXI-021: pasa la ropa del rechazado al que ya existe. */
      usarMismoCliente: (registro: RegistroParaCorregir, existente: Cliente) => Promise<{ boletas: number }>;
    };

/**
 * La puerta de la pantalla a corregir y descartar — SPEC-KRILINXI-013 (mismo patrón que
 * `useRegistrarRopa`). La sucursal es la de trabajo (SPEC-KRILINXI-029): la boleta corregida se
 * valida contra la ropa de esa sucursal, que es la única que la tablet conoce (CLAUDE.md §6).
 */
export function useCorreccion(): Correcciones {
  const base = useBaseLocal();
  const sucursalId = useSucursalDeTrabajo() ?? '';

  return useMemo<Correcciones>(() => {
    if (!base) return { lista: false };
    return {
      lista: true,
      guardar: (registro, valores) => guardarCorreccion(base, sucursalId, registro, valores),
      descartar: (registro) => descartarRegistro(base, registro.id),
      buscarMismoCliente: (registro) => buscarMismoCliente(base, registro),
      usarMismoCliente: (registro, existente) => usarMismoCliente(base, registro, existente),
    };
  }, [base, sucursalId]);
}
