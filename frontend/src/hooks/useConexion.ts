import { useEffect, useState } from 'react';
import { useBaseLocal, type EstadoSubida } from '../lib/powersync';

/**
 * Cómo va la conexión y cuánto falta guardar en el servidor — SPEC-KRILINXI-007.
 *
 * Transversal (lo usa el aviso que está en todas las pantallas), por eso vive en `hooks/` y
 * no en una feature. Es null mientras la base local se abre o si nadie entró.
 */
export function useConexion(): EstadoSubida | null {
  const base = useBaseLocal();
  const [estado, setEstado] = useState<EstadoSubida | null>(null);

  useEffect(() => {
    if (!base) {
      setEstado(null);
      return;
    }
    return base.observarEstado(setEstado);
  }, [base]);

  return estado;
}
