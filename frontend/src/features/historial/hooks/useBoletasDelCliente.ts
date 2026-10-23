import { useEffect, useState } from 'react';
import { usePaginado } from '../../../hooks/usePaginado';
import { useBaseLocal } from '../../../lib/powersync';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { obtenerCliente } from '../../clientes/api/clientesLocal';
import type { Cliente } from '../../clientes/types';
import { listarBoletasDelCliente } from '../api/historialLocal';
import type { BoletaListada } from '../types';

type Leido = { cliente: Cliente | null; boletas: BoletaListada[] };

/**
 * Las boletas de un cliente en la sucursal de trabajo, de la base local — SPEC-KRILINXI-061. `leido` es
 * false mientras se lee la primera vez; `cliente` es null si ese id no existe en la tablet. Se vuelve a
 * leer cuando cambia algo en la base, y se pagina sobre lo leído, como el historial.
 */
export function useBoletasDelCliente(clienteId: string) {
  const base = useBaseLocal();
  const sucursalId = useSucursalDeTrabajo();
  const [leido, setLeido] = useState<Leido | null>(null);

  useEffect(() => {
    if (!base || !sucursalId) return;
    let vigente = true;
    const leer = () => {
      Promise.all([obtenerCliente(base, clienteId), listarBoletasDelCliente(base, sucursalId, clienteId)])
        .then(([cliente, boletas]) => vigente && setLeido({ cliente, boletas }))
        .catch((error: unknown) => console.error('No se pudieron leer las boletas del cliente.', error));
    };
    const dejar = base.observarEstado(leer);
    return () => {
      vigente = false;
      dejar();
    };
  }, [base, sucursalId, clienteId]);

  const { visibles, ...paginas } = usePaginado(leido?.boletas ?? null, clienteId);
  return { cliente: leido?.cliente ?? null, leido: leido !== null, boletas: visibles, ...paginas };
}
