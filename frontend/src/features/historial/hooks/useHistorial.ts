import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePagina, usePaginado } from '../../../hooks/usePaginado';
import { usePedidoOnline } from '../../../hooks/usePedidoOnline';
import { useTamanoDePagina } from '../../../hooks/useTamanoDePagina';
import { hoyEnBolivia } from '../../../lib/diaDelNegocio';
import { useBaseLocal } from '../../../lib/powersync';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { ERROR_HISTORIAL, pedirHistorial } from '../api/historialApi';
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

/**
 * Las boletas de la sucursal de trabajo, de la base local — SPEC-KRILINXI-041. `boletas` es null
 * mientras se lee la primera vez: decir "no hay boletas" un instante sería un cero falso.
 *
 * Se vuelve a leer cada vez que cambia el filtro y cada vez que cambia algo en la base
 * (`observarEstado`, como `useHoy`): si baja una entrega o se cobra desde otra tablet, la lista se
 * actualiza sola. Una lectura que llega tarde, de un filtro viejo, se descarta. Se pagina acá
 * (`usePaginado`, del tamaño de la pantalla), sobre lo ya leído: es local y no cuesta nada.
 */
export function useHistorialDeLaSucursal(filtro: FiltroHistorial) {
  const base = useBaseLocal();
  const sucursalId = useSucursalDeTrabajo();
  const [todas, setTodas] = useState<BoletaListada[] | null>(null);

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

  const { visibles, ...paginas } = usePaginado(todas, filtro);
  return { boletas: visibles, ...paginas };
}

/**
 * El historial completo de todas las sucursales, de la API — SPEC-KRILINXI-041. Online, con
 * `usePedidoOnline`: cargando, sin conexión, error, la recarga al volver internet y el descarte de
 * la respuesta vieja. Lo escrito en el buscador espera una pausa antes de pedirse, y cuántas boletas
 * se piden por página depende de la pantalla.
 */
export function useHistorialCompleto(filtro: FiltroHistorial) {
  const texto = useConDemora(filtro.texto, PAUSA_DEL_BUSCADOR_MS);
  const porPagina = useTamanoDePagina();
  // Lo que se pide, como texto: mientras no cambie nada de lo que viaja a la API (una letra suelta
  // del buscador, por ejemplo, no viaja) no se pide de nuevo ni se vuelve a la primera página.
  const clave = JSON.stringify(parametrosHistorial({ ...filtro, texto }));
  const parametros = useMemo(() => JSON.parse(clave) as ParametrosHistorial, [clave]);
  const { pagina, irAPagina } = usePagina(clave, porPagina);

  const pedir = useCallback(() => pedirHistorial(parametros, pagina, porPagina), [parametros, pagina, porPagina]);
  const { estado, recargar } = usePedidoOnline(pedir, ERROR_HISTORIAL);
  return { estado, recargar, pagina, irAPagina };
}
