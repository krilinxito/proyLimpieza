import { createContext, useContext } from 'react';
import type { BaseLocal } from './control';

/** La base local del que está adentro, o null si nadie entró o todavía se está abriendo. */
export const ContextoBaseLocal = createContext<BaseLocal | null>(null);

/**
 * Para las features: `const base = useBaseLocal();` y después `base?.consultar(...)`.
 * Es null mientras la base se abre (un instante al entrar) o si no hay sesión.
 */
export function useBaseLocal(): BaseLocal | null {
  return useContext(ContextoBaseLocal);
}
