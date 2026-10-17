import { useCallback, useState } from 'react';
import { pedirClientes } from '../api/estadisticasApi';
import { hoyEnBolivia, parametrosHistoria, type Filtro } from '../periodo';
import type { ClientesAtendidos } from '../types';
import { usePedidoOnline, type EstadoPedido } from './usePedidoOnline';

/**
 * Los clientes atendidos en el período, de a una página — SPEC-KRILINXI-016.
 *
 * Aparte de `usePanel` para que pasar de página no vuelva a pedir todo el panel. Cambiar el
 * filtro vuelve a la página 1: la página 4 de otro período no tiene por qué existir.
 */
export function useClientesAtendidos(filtro: Filtro): {
  estado: EstadoPedido<ClientesAtendidos>;
  recargar: () => void;
  pagina: number;
  irAPagina: (pagina: number) => void;
} {
  // La página se guarda junto con el filtro para el que se eligió: con otro filtro vale 1 desde
  // el primer render. Con un `useEffect` que la reseteara, saldría primero un pedido de la
  // página vieja con el filtro nuevo, y recién después el de la página 1.
  const [elegida, setElegida] = useState({ filtro, pagina: 1 });
  const pagina = elegida.filtro === filtro ? elegida.pagina : 1;
  const irAPagina = useCallback((nueva: number) => setElegida({ filtro, pagina: nueva }), [filtro]);

  const pedir = useCallback(() => pedirClientes(parametrosHistoria(filtro, hoyEnBolivia()), pagina), [filtro, pagina]);
  const { estado, recargar } = usePedidoOnline(pedir);
  return { estado, recargar, pagina, irAPagina };
}
