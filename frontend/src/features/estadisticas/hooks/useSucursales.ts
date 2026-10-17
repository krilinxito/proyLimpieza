import { useEffect, useState } from 'react';
import { useBaseLocal } from '../../../lib/powersync';
import { listarSucursales } from '../api/sucursalesLocal';
import type { SucursalElegible } from '../types';

/** Las sucursales del filtro, de la base local. Vacía mientras se lee. */
export function useSucursales(): SucursalElegible[] {
  const base = useBaseLocal();
  const [sucursales, setSucursales] = useState<SucursalElegible[]>([]);

  useEffect(() => {
    if (!base) return;
    let vigente = true;
    listarSucursales(base)
      .then((lista) => vigente && setSucursales(lista))
      .catch((error: unknown) => console.error('No se pudieron leer las sucursales.', error));
    return () => {
      vigente = false;
    };
  }, [base]);

  return sucursales;
}
