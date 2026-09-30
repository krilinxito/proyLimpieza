import { createContext } from 'react';
import type { Sesion } from './types';

export type ValorSesion = {
  /** null cuando nadie ingresó. */
  sesion: Sesion | null;
  /** Hace el login y guarda la sesión. Lanza `ErrorApi` o `ErrorSinConexion` si falla. */
  ingresar: (username: string, password: string) => Promise<void>;
  /** Borra la sesión del dispositivo. */
  salir: () => void;
};

/** Se lee con `useSession()` (hooks/useSession.ts), no con `useContext` directo. */
export const ContextoSesion = createContext<ValorSesion | null>(null);
