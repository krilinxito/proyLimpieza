import { useCallback } from 'react';
import { ERROR_ESTADISTICAS, pedirClientes } from '../api/estadisticasApi';
import { hoyEnBolivia, parametrosHistoria, type Filtro } from '../periodo';
import type { ClientesAtendidos } from '../types';
import { usePagina } from '../../../hooks/usePaginado';
import { usePedidoOnline, type EstadoPedido } from '../../../hooks/usePedidoOnline';
import { useTamanoDePagina } from '../../../hooks/useTamanoDePagina';

/**
 * Los clientes atendidos en el período, de a una página — SPEC-KRILINXI-016.
 *
 * Aparte de `usePanel` para que pasar de página no vuelva a pedir todo el panel. Cambiar el
 * filtro vuelve a la página 1: la página 4 de otro período no tiene por qué existir. Cuántos
 * entran en una página depende de la pantalla (`useTamanoDePagina`, SPEC-KRILINXI-041).
 */
export function useClientesAtendidos(filtro: Filtro): {
  estado: EstadoPedido<ClientesAtendidos>;
  recargar: () => void;
  pagina: number;
  irAPagina: (pagina: number) => void;
} {
  const porPagina = useTamanoDePagina();
  // La página se guarda junto con el filtro para el que se eligió (`usePagina`): con otro filtro, o
  // con otro tamaño de pantalla, vale 1 desde el primer render.
  const { pagina, irAPagina } = usePagina(filtro, porPagina);

  const pedir = useCallback(
    () => pedirClientes(parametrosHistoria(filtro, hoyEnBolivia()), pagina, porPagina),
    [filtro, pagina, porPagina],
  );
  const { estado, recargar } = usePedidoOnline(pedir, ERROR_ESTADISTICAS);
  return { estado, recargar, pagina, irAPagina };
}
