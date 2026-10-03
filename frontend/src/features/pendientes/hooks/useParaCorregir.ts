import { useEffect, useState } from 'react';
import { useBaseLocal } from '../../../lib/powersync';
import { listarParaCorregir, type RegistroParaCorregir } from '../api/paraCorregirLocal';

/**
 * Los registros que no se pudieron guardar, al día — SPEC-KRILINXI-007. Se vuelven a leer
 * cada vez que el estado de la subida cambia, así la lista no queda vieja si llega uno nuevo
 * con la pantalla abierta. `null` mientras se lee la primera vez.
 */
export function useParaCorregir(): RegistroParaCorregir[] | null {
  const base = useBaseLocal();
  const [registros, setRegistros] = useState<RegistroParaCorregir[] | null>(null);

  useEffect(() => {
    if (!base) return;
    let vigente = true;
    const leer = () => {
      listarParaCorregir(base)
        .then((lista) => vigente && setRegistros(lista))
        .catch((error: unknown) => console.error('No se pudieron leer los registros para corregir.', error));
    };
    const dejar = base.observarEstado(leer);
    return () => {
      vigente = false;
      dejar();
    };
  }, [base]);

  return registros;
}
