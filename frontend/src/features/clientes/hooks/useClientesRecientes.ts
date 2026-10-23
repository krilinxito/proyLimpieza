import { useEffect, useState } from 'react';
import { usePaginado } from '../../../hooks/usePaginado';
import { useBaseLocal } from '../../../lib/powersync';
import { listarRecientes } from '../api/clientesLocal';
import type { Cliente } from '../types';

/**
 * Los clientes por su última boleta, de la base local y paginados — SPEC-KRILINXI-061. `clientes` es
 * null mientras se lee la primera vez: decir "no hay clientes" un instante sería un cero falso.
 *
 * Se vuelve a leer cada vez que cambia algo en la base (`observarEstado`, como el historial): un cliente
 * dado de alta o una boleta que baja de otra tablet lo acomodan solos. Se pagina acá, sobre lo ya leído
 * (`usePaginado`, del tamaño de la pantalla).
 */
export function useClientesRecientes() {
  const base = useBaseLocal();
  const [todos, setTodos] = useState<Cliente[] | null>(null);

  useEffect(() => {
    if (!base) return;
    let vigente = true;
    const leer = () => {
      listarRecientes(base)
        .then((lista) => vigente && setTodos(lista))
        .catch((error: unknown) => console.error('No se pudo leer la lista de clientes.', error));
    };
    const dejar = base.observarEstado(leer);
    return () => {
      vigente = false;
      dejar();
    };
  }, [base]);

  const { visibles, ...paginas } = usePaginado(todos);
  return { clientes: visibles, ...paginas };
}
