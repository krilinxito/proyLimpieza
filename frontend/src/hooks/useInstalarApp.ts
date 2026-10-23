import { useCallback, useState, useSyncExternalStore } from 'react';
import { estadoDeInstalacion, instalar, suscribirseALaInstalacion, type EstadoDeInstalacion } from '../pwa/instalacion';

/**
 * Lo que la pantalla necesita para ofrecer instalar la app — SPEC-KRILINXI-059. El estado sale de `pwa/instalacion`
 * (que escucha al navegador desde el arranque); esto solo lo lee y suma "Ahora no".
 *
 * "Ahora no" esconde el aviso hasta que se recargue la app: no se guarda para siempre, porque quien tocó "Ahora no" un día
 * puede querer instalarla otro, y un botón que desaparece sin vuelta atrás no se puede recuperar.
 */
export function useInstalarApp(): { estado: EstadoDeInstalacion; instalar: () => Promise<void>; descartar: () => void } {
  const real = useSyncExternalStore(suscribirseALaInstalacion, () => estadoDeInstalacion());
  const [descartado, setDescartado] = useState(false);

  const pedirInstalacion = useCallback(async () => {
    await instalar();
  }, []);
  const descartar = useCallback(() => setDescartado(true), []);

  return { estado: descartado ? 'nada' : real, instalar: pedirInstalacion, descartar };
}
