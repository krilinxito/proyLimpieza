import { createContext } from 'react';
import type { Sesion } from './types';

export type ValorSesion = {
  /** null cuando nadie ingresó. */
  sesion: Sesion | null;
  /** Hace el login y guarda la sesión. Lanza `ErrorApi` o `ErrorSinConexion` si falla. */
  ingresar: (username: string, password: string) => Promise<void>;
  /** Borra la sesión del dispositivo. */
  salir: () => void;
  /**
   * La sucursal donde atiende el ADMIN, o null — SPEC-KRILINXI-029. Para un EMPLEADO siempre es
   * null: la suya es la asignada. Las pantallas no la leen de acá: usan `useSucursalDeTrabajo`
   * o `useAtencion` (`features/atencion/hooks/`).
   */
  atencion: string | null;
  /** Empieza a atender en esa sucursal, o deja de atender con null. Para un EMPLEADO no hace nada. */
  atender: (sucursalId: string | null) => void;
};

/** Se lee con `useSession()` (hooks/useSession.ts), no con `useContext` directo. */
export const ContextoSesion = createContext<ValorSesion | null>(null);
