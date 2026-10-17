import { useCallback, useEffect, useState } from 'react';
import { ErrorApi, ErrorSinConexion } from '../../../lib/api';
import { pedirIngresos, pedirSaldos, pedirSinRecoger, RespuestaRara } from '../api/estadisticasApi';
import { hoyEnBolivia, parametrosIngresos, parametrosPendientes, type Filtro } from '../periodo';
import type { Panel } from '../types';

export type EstadoPanel =
  | { tipo: 'cargando' }
  /** Sin internet: la pantalla lo dice y no muestra ningún número (CLAUDE.md §8). */
  | { tipo: 'sin-conexion' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; panel: Panel };

const ERROR_GENERAL = 'No se pudieron traer las estadísticas. Probá de nuevo y, si sigue pasando, avisale al encargado.';

function mensajeDe(error: unknown): EstadoPanel {
  if (error instanceof ErrorSinConexion) return { tipo: 'sin-conexion' };
  // El servidor ya escribe sus mensajes para quien está mirando, sin códigos.
  if (error instanceof ErrorApi || error instanceof RespuestaRara) return { tipo: 'error', mensaje: error.message };
  return { tipo: 'error', mensaje: ERROR_GENERAL };
}

/**
 * Las tres métricas del panel, pedidas a la API para el filtro elegido — SPEC-KRILINXI-015.
 *
 * Se piden juntas: si una falla, el panel no se muestra a medias. Vuelve a pedirlas cuando
 * cambia el filtro, cuando el navegador avisa que volvió internet (`online`) y con
 * `recargar`. Si el admin cambia el filtro antes de que lleguen, la respuesta vieja se descarta
 * (→ SPEC-KRILINXI-010, "descartar una respuesta que llega tarde").
 */
export function usePanel(filtro: Filtro): { estado: EstadoPanel; recargar: () => void } {
  const [estado, setEstado] = useState<EstadoPanel>({ tipo: 'cargando' });
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    let vigente = true;
    setEstado({ tipo: 'cargando' });
    const hoy = hoyEnBolivia();
    const ingresos = parametrosIngresos(filtro, hoy);
    const pendientes = parametrosPendientes(filtro, hoy);
    Promise.all([pedirIngresos(ingresos), pedirSaldos(pendientes), pedirSinRecoger(pendientes)])
      .then(([i, s, r]) => vigente && setEstado({ tipo: 'listo', panel: { ingresos: i, saldos: s, sinRecoger: r } }))
      .catch((error: unknown) => vigente && setEstado(mensajeDe(error)));
    return () => {
      vigente = false;
    };
  }, [filtro, vuelta]);

  useEffect(() => {
    window.addEventListener('online', recargar);
    return () => window.removeEventListener('online', recargar);
  }, [recargar]);

  return { estado, recargar };
}
