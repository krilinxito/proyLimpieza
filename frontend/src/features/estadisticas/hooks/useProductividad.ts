import { useCallback } from 'react';
import { ERROR_ESTADISTICAS, pedirProductividad } from '../api/estadisticasApi';
import { hoyEnBolivia, parametrosHistoria, type Filtro } from '../periodo';
import type { Productividad } from '../types';
import { usePedidoOnline, type EstadoPedido } from '../../../hooks/usePedidoOnline';

/**
 * Lo que hizo cada persona, para su tarjeta — SPEC-KRILINXI-050. Salió de `usePanel` (SPEC-KRILINXI-016): esa
 * tarjeta queda plegada bajo "Ver más estadísticas" y ninguno de los cuatro indicadores de arriba la usa,
 * así que no se pide hasta que se despliega, igual que los clientes (`useClientesAtendidos`). Los últimos
 * 30 días sin fechas elegidas, como el volumen (`parametrosHistoria`).
 */
export function useProductividad(filtro: Filtro): { estado: EstadoPedido<Productividad>; recargar: () => void } {
  const pedir = useCallback(() => pedirProductividad(parametrosHistoria(filtro, hoyEnBolivia())), [filtro]);
  return usePedidoOnline(pedir, ERROR_ESTADISTICAS);
}
