import { useSession } from '../../../hooks/useSession';

export type Atencion =
  /** Un EMPLEADO (o nadie adentro): trabaja en su sucursal y no tiene nada que elegir. */
  | { puedeElegir: false }
  | {
      puedeElegir: true;
      /** Dónde atiende ahora, o null si no está atendiendo. */
      sucursalId: string | null;
      empezar: (sucursalId: string) => void;
      dejar: () => void;
    };

/**
 * "Atender en una sucursal" y "Dejar de atender", para el ADMIN — SPEC-KRILINXI-029.
 *
 * Empezar guarda la elección en la tablet y reconecta la sincronización con esa sucursal, así
 * baja su ropa; dejar la borra y reconecta sin ella. Lo hace `SesionProvider`, que es quien
 * conecta PowerSync: este hook solo pone las dos acciones al alcance de la pantalla.
 */
export function useAtencion(): Atencion {
  const { sesion, atencion, atender } = useSession();
  if (sesion?.usuario.rol !== 'ADMIN') return { puedeElegir: false };
  return { puedeElegir: true, sucursalId: atencion, empezar: atender, dejar: () => atender(null) };
}
