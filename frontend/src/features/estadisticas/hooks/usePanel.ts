import { useCallback } from 'react';
import { ERROR_ESTADISTICAS, pedirIngresos, pedirSaldos, pedirSinRecoger, pedirVolumen } from '../api/estadisticasApi';
import { hoyEnBolivia, parametrosHistoria, parametrosIngresos, parametrosPendientes, type Filtro } from '../periodo';
import type { Panel } from '../types';
import { usePedidoOnline, type EstadoPedido } from '../../../hooks/usePedidoOnline';

export type EstadoPanel = EstadoPedido<Panel>;

/**
 * Las métricas del panel, pedidas a la API para el filtro elegido — SPEC-KRILINXI-015, con
 * volumen desde SPEC-KRILINXI-016. La productividad salió en SPEC-KRILINXI-050 (`useProductividad`): solo la
 * usa una tarjeta plegada, y no se pide hasta que se despliega.
 *
 * Se piden juntas: si una falla, el panel no se muestra a medias. Cada una con su período:
 * los ingresos, de hoy; lo pendiente, todo; la historia, los últimos 30 días (ver `periodo.ts`).
 */
export function usePanel(filtro: Filtro): { estado: EstadoPanel; recargar: () => void } {
  const pedir = useCallback(async (): Promise<Panel> => {
    const hoy = hoyEnBolivia();
    const pendientes = parametrosPendientes(filtro, hoy);
    const historia = parametrosHistoria(filtro, hoy);
    const [ingresos, saldos, sinRecoger, volumen] = await Promise.all([
      pedirIngresos(parametrosIngresos(filtro, hoy)),
      pedirSaldos(pendientes),
      pedirSinRecoger(pendientes),
      pedirVolumen(historia),
    ]);
    return { ingresos, saldos, sinRecoger, volumen };
  }, [filtro]);

  return usePedidoOnline(pedir, ERROR_ESTADISTICAS);
}
