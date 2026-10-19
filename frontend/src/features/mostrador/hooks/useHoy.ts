import { useEffect, useState } from 'react';
import { hoyEnBolivia } from '../../../lib/diaDelNegocio';
import { useBaseLocal } from '../../../lib/powersync';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { hoyEnLaSucursal, type Hoy } from '../api/hoyLocal';

/**
 * Lo de hoy en la sucursal de trabajo, para el Inicio — SPEC-KRILINXI-035. null mientras se lee la
 * primera vez, o si quien está adentro no trabaja en ninguna sucursal.
 *
 * Se vuelve a leer cada vez que cambia algo en la base (`observarEstado`, como `useSucursales`):
 * si se entrega una boleta o baja un cobro de otra tablet, el Inicio se actualiza solo.
 */
export function useHoy(): Hoy | null {
  const base = useBaseLocal();
  const sucursalId = useSucursalDeTrabajo();
  const [hoy, setHoy] = useState<Hoy | null>(null);

  useEffect(() => {
    if (!base || !sucursalId) return;
    let vigente = true;
    const leer = () => {
      hoyEnLaSucursal(base, sucursalId, hoyEnBolivia())
        .then((leido) => vigente && setHoy(leido))
        .catch((error: unknown) => console.error('No se pudo leer lo de hoy en la sucursal.', error));
    };
    const dejar = base.observarEstado(leer);
    return () => {
      vigente = false;
      dejar();
    };
  }, [base, sucursalId]);

  return hoy;
}
