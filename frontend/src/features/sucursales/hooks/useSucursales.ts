import { useEffect, useMemo, useState } from 'react';
import { useBaseLocal } from '../../../lib/powersync';
import { cambiarApertura, crearSucursal, editarSucursal } from '../api/sucursalesApi';
import { listarSucursales } from '../api/sucursalesLocal';
import type { DatosSucursal, ResultadoSucursal, Sucursal } from '../types';

/**
 * Las sucursales de la base local, al día — SPEC-KRILINXI-017. Se vuelven a leer cada vez que
 * cambia algo en la base (`observarEstado`): un alta hecha en la API aparece sola cuando
 * PowerSync la baja, sin recargar. `null` mientras se lee la primera vez.
 */
export function useSucursales(): Sucursal[] | null {
  const base = useBaseLocal();
  const [sucursales, setSucursales] = useState<Sucursal[] | null>(null);

  useEffect(() => {
    if (!base) return;
    let vigente = true;
    const leer = () => {
      listarSucursales(base)
        .then((lista) => vigente && setSucursales(lista))
        .catch((error: unknown) => console.error('No se pudieron leer las sucursales.', error));
    };
    const dejar = base.observarEstado(leer);
    return () => {
      vigente = false;
      dejar();
    };
  }, [base]);

  return sucursales;
}

/** Solo las abiertas: las que pueden recibir personal (y las que tienen caja que mirar). */
export function useSucursalesAbiertas(): Sucursal[] {
  const todas = useSucursales();
  return useMemo(() => (todas ?? []).filter((s) => s.activa), [todas]);
}

/** Los cambios que puede hacer el admin. No dependen de la base local: van a la API. */
export const cambiosDeSucursal: {
  crear: (datos: DatosSucursal) => Promise<ResultadoSucursal>;
  editar: (sucursal: Sucursal, datos: DatosSucursal) => Promise<ResultadoSucursal>;
  cambiarApertura: (sucursal: Sucursal, activa: boolean) => Promise<ResultadoSucursal>;
} = { crear: crearSucursal, editar: editarSucursal, cambiarApertura };
