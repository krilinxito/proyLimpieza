import { useEffect, useState } from 'react';
import { useBaseLocal } from '../../../lib/powersync';
import { crearCuenta, darDeAlta, darDeBaja, editarCuenta } from '../api/cuentasApi';
import { listarCuentas } from '../api/cuentasLocal';
import type { Cuenta, DatosAlta, DatosEdicion, ResultadoCuenta } from '../types';

/**
 * Las cuentas de la base local, al día — SPEC-KRILINXI-017 (mismo patrón que `useSucursales`):
 * un cambio hecho en la API aparece solo cuando PowerSync lo baja. `null` mientras se lee.
 */
export function useCuentas(): Cuenta[] | null {
  const base = useBaseLocal();
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);

  useEffect(() => {
    if (!base) return;
    let vigente = true;
    const leer = () => {
      listarCuentas(base)
        .then((lista) => vigente && setCuentas(lista))
        .catch((error: unknown) => console.error('No se pudieron leer las cuentas.', error));
    };
    const dejar = base.observarEstado(leer);
    return () => {
      vigente = false;
      dejar();
    };
  }, [base]);

  return cuentas;
}

/** Los cambios que puede hacer el admin. Van a la API, no a la base local. */
export const cambiosDeCuenta: {
  crear: (datos: DatosAlta) => Promise<ResultadoCuenta>;
  editar: (cuenta: Cuenta, datos: DatosEdicion) => Promise<ResultadoCuenta>;
  darDeBaja: (cuenta: Cuenta) => Promise<ResultadoCuenta>;
  darDeAlta: (cuenta: Cuenta) => Promise<ResultadoCuenta>;
} = { crear: crearCuenta, editar: editarCuenta, darDeBaja, darDeAlta };
