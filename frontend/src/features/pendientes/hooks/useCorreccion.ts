import { useMemo } from 'react';
import { useSession } from '../../../hooks/useSession';
import { useBaseLocal } from '../../../lib/powersync';
import { descartarRegistro, guardarCorreccion } from '../api/corregirLocal';
import type { ResultadoCorreccion } from '../correccion';
import type { RegistroParaCorregir } from '../types';

export type Correcciones =
  /** La base local se está abriendo. */
  | { lista: false }
  | {
      lista: true;
      guardar: (registro: RegistroParaCorregir, valores: Record<string, string>) => Promise<ResultadoCorreccion>;
      descartar: (registro: RegistroParaCorregir) => Promise<void>;
    };

/**
 * La puerta de la pantalla a corregir y descartar — SPEC-KRILINXI-013 (mismo patrón que
 * `useRegistrarRopa`). La sucursal sale de la sesión: la boleta corregida se valida contra
 * la ropa de esa sucursal, que es la única que la tablet conoce (CLAUDE.md §6).
 */
export function useCorreccion(): Correcciones {
  const base = useBaseLocal();
  const { sesion } = useSession();
  const sucursalId = sesion?.usuario.sucursalId ?? '';

  return useMemo<Correcciones>(() => {
    if (!base) return { lista: false };
    return {
      lista: true,
      guardar: (registro, valores) => guardarCorreccion(base, sucursalId, registro, valores),
      descartar: (registro) => descartarRegistro(base, registro.id),
    };
  }, [base, sucursalId]);
}
