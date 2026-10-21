import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePedidoOnline } from '../../../hooks/usePedidoOnline';
import { hoyEnBolivia } from '../../../lib/diaDelNegocio';
import { useBaseLocal } from '../../../lib/powersync';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { BOLETAS_POR_PAGINA, ERROR_HISTORIAL, pedirHistorial } from '../api/historialApi';
import { listarHistorialLocal } from '../api/historialLocal';
import { parametrosHistorial, type FiltroHistorial, type ParametrosHistorial } from '../filtro';
import type { BoletaListada } from '../types';

/**
 * Qué historial ve quien está adentro — SPEC-KRILINXI-041: el de su sucursal de trabajo (un
 * EMPLEADO siempre; un ADMIN mientras atiende) o, si no trabaja en ninguna, el completo de la API.
 * La sucursal sale de `useSucursalDeTrabajo`, el único lugar que la decide (SPEC-KRILINXI-029).
 */
export function useModoDelHistorial(): 'sucursal' | 'completo' {
  return useSucursalDeTrabajo() ? 'sucursal' : 'completo';
}

/**
 * Un valor que se actualiza cuando deja de cambiar durante `ms`. Para no pedirle a la API una lista
 * por cada tecla del buscador: se espera a que la persona haga una pausa.
 */
function useConDemora<T>(valor: T, ms: number): T {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const espera = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(espera);
  }, [valor, ms]);
  return demorado;
}

/** Cuánto se espera después de la última tecla antes de pedirle la lista a la API. */
const PAUSA_DEL_BUSCADOR_MS = 400;

/** Una página, guardada con el filtro con que se eligió: con otro filtro vuelve a valer 1. */
function usePagina(filtro: unknown) {
  const [elegida, setElegida] = useState({ filtro, pagina: 1 });
  const pagina = elegida.filtro === filtro ? elegida.pagina : 1;
  const irAPagina = useCallback((nueva: number) => setElegida({ filtro, pagina: nueva }), [filtro]);
  return { pagina, irAPagina };
}

/**
 * Las boletas de la sucursal de trabajo, de la base local — SPEC-KRILINXI-041. `boletas` es null
 * mientras se lee la primera vez: decir "no hay boletas" un instante sería un cero falso.
 *
 * Se vuelve a leer cada vez que cambia el filtro y cada vez que cambia algo en la base
 * (`observarEstado`, como `useHoy`): si baja una entrega o se cobra desde otra tablet, la lista se
 * actualiza sola. Una lectura que llega tarde, de un filtro viejo, se descarta. Se pagina acá,
 * sobre lo ya leído: es local y no cuesta nada.
 */
export function useHistorialDeLaSucursal(filtro: FiltroHistorial) {
  const base = useBaseLocal();
  const sucursalId = useSucursalDeTrabajo();
  const [todas, setTodas] = useState<BoletaListada[] | null>(null);
  const { pagina, irAPagina } = usePagina(filtro);

  useEffect(() => {
    if (!base || !sucursalId) return;
    let vigente = true;
    const leer = () => {
      listarHistorialLocal(base, sucursalId, filtro, hoyEnBolivia())
        .then((lista) => vigente && setTodas(lista))
        .catch((error: unknown) => console.error('No se pudo leer el historial de boletas.', error));
    };
    const dejar = base.observarEstado(leer);
    return () => {
      vigente = false;
      dejar();
    };
  }, [base, sucursalId, filtro]);

  const visibles = todas ? todas.slice((pagina - 1) * BOLETAS_POR_PAGINA, pagina * BOLETAS_POR_PAGINA) : null;
  return { boletas: visibles, total: todas?.length ?? 0, porPagina: BOLETAS_POR_PAGINA, pagina, irAPagina };
}

/**
 * El historial completo de todas las sucursales, de la API — SPEC-KRILINXI-041. Online, con
 * `usePedidoOnline`: cargando, sin conexión, error, la recarga al volver internet y el descarte de
 * la respuesta vieja. Lo escrito en el buscador espera una pausa antes de pedirse.
 */
export function useHistorialCompleto(filtro: FiltroHistorial) {
  const texto = useConDemora(filtro.texto, PAUSA_DEL_BUSCADOR_MS);
  // Lo que se pide, como texto: mientras no cambie nada de lo que viaja a la API (una letra suelta
  // del buscador, por ejemplo, no viaja) no se pide de nuevo ni se vuelve a la primera página.
  const clave = JSON.stringify(parametrosHistorial({ ...filtro, texto }));
  const parametros = useMemo(() => JSON.parse(clave) as ParametrosHistorial, [clave]);
  const { pagina, irAPagina } = usePagina(clave);

  const pedir = useCallback(() => pedirHistorial(parametros, pagina), [parametros, pagina]);
  const { estado, recargar } = usePedidoOnline(pedir, ERROR_HISTORIAL);
  return { estado, recargar, pagina, irAPagina };
}
