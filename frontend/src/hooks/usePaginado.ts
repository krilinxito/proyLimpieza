import { useCallback, useState } from 'react';
import { useTamanoDePagina } from './useTamanoDePagina';

/**
 * La página elegida, guardada junto con lo que la hace válida — SPEC-KRILINXI-041 (salió de
 * `useAuditoria` y `useClientesAtendidos`, que la tenían escrita cada uno). Cuando `reinicio` o
 * `porPagina` cambian (otro filtro, otro tamaño de pantalla), vale 1 desde el primer render: con un
 * `useEffect` que la reseteara, saldría primero un pedido de la página vieja con el filtro nuevo, y
 * recién después el de la página 1 (→ SPEC-KRILINXI-016, "reiniciar un estado cuando cambia otro sin
 * useEffect"). La página 3 de a 6 no es la página 3 de a 20, por eso el tamaño también reinicia.
 *
 * `reinicio` se compara por identidad (`===`): pasá un valor primitivo o un objeto estable.
 */
export function usePagina(
  reinicio: unknown,
  porPagina: number,
): { pagina: number; irAPagina: (pagina: number) => void } {
  const [elegida, setElegida] = useState({ reinicio, porPagina, pagina: 1 });
  const vigente = elegida.reinicio === reinicio && elegida.porPagina === porPagina;
  const irAPagina = useCallback((nueva: number) => setElegida({ reinicio, porPagina, pagina: nueva }), [reinicio, porPagina]);
  return { pagina: vigente ? elegida.pagina : 1, irAPagina };
}

/**
 * Una lista que ya está en memoria (la de la base local, o la que contestó la API entera), partida
 * en páginas del tamaño que pide la pantalla — SPEC-KRILINXI-041. `items` es `null` mientras se lee la
 * primera vez: `visibles` también, para no decir "no hay nada" de más.
 *
 *  - Con otro `reinicio` (el filtro, lo que se busca) vuelve a la página 1.
 *  - Si la lista se achica y la página elegida ya no existe —se corrigió el último registro de la
 *    última página—, muestra la última que tenga. Una página vacía con la barra diciendo
 *    "Página 3 de 2" sería un callejón sin salida.
 */
export function usePaginado<T>(items: T[] | null, reinicio: unknown = null) {
  const porPagina = useTamanoDePagina();
  const { pagina: pedida, irAPagina } = usePagina(reinicio, porPagina);

  const total = items?.length ?? 0;
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(pedida, ultima);
  const visibles = items ? items.slice((pagina - 1) * porPagina, pagina * porPagina) : null;

  return { visibles, pagina, irAPagina, total, porPagina };
}
