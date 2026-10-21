import { useCallback } from 'react';
import { ERROR_ESTADISTICAS, pedirIngresosPorDia } from '../api/estadisticasApi';
import { hoyEnBolivia, parametrosHistoria, type Filtro } from '../periodo';
import type { IngresosPorDia } from '../types';
import { usePedidoOnline, type EstadoPedido } from '../../../hooks/usePedidoOnline';

/**
 * Lo cobrado día por día, para el gráfico de tendencia — SPEC-KRILINXI-044. Se pide aparte del resto
 * del panel (como los clientes, `useClientesAtendidos`): no es una de las cuatro cifras de arriba, y así
 * el Inicio del admin, que reusa `usePanel`, no pide de más.
 *
 * Una tendencia necesita varios días: sin fechas elegidas son **los últimos 30 días** (`parametrosHistoria`),
 * como el volumen, y no "hoy", que sería un solo punto. Con fechas o sucursal elegidas, esas.
 */
export function useIngresosPorDia(filtro: Filtro): { estado: EstadoPedido<IngresosPorDia>; recargar: () => void } {
  const pedir = useCallback(() => pedirIngresosPorDia(parametrosHistoria(filtro, hoyEnBolivia())), [filtro]);
  return usePedidoOnline(pedir, ERROR_ESTADISTICAS);
}
