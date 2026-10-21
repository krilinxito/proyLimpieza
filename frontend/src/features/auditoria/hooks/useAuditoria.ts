import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePagina } from '../../../hooks/usePaginado';
import { usePedidoOnline, type EstadoPedido } from '../../../hooks/usePedidoOnline';
import { useTamanoDePagina } from '../../../hooks/useTamanoDePagina';
import { useBaseLocal } from '../../../lib/powersync';
import { hoyEnBolivia } from '../../estadisticas/periodo';
import { useSucursales } from '../../sucursales/hooks/useSucursales';
import { useCuentas } from '../../usuarios/hooks/useCuentas';
import { ERROR_AUDITORIA, pedirAuditoria } from '../api/auditoriaApi';
import { nombresDeClientes } from '../api/nombresLocal';
import { parametrosAuditoria, type FiltroAuditoria } from '../filtro';
import type { NombresConocidos, PaginaAuditoria } from '../types';

/**
 * Una página de la auditoría para el filtro elegido — SPEC-KRILINXI-018. Online, con
 * `usePedidoOnline`. La página se guarda con su filtro: con otro filtro vale 1 desde el primer
 * render (→ SPEC-KRILINXI-016, "reiniciar un estado cuando cambia otro sin useEffect").
 */
export function useAuditoria(filtro: FiltroAuditoria) {
  // Cuántos registros entran en una página depende de la pantalla (SPEC-KRILINXI-041).
  const porPagina = useTamanoDePagina();
  const { pagina, irAPagina } = usePagina(filtro, porPagina);

  const pedir = useCallback(
    () => pedirAuditoria(parametrosAuditoria(filtro, hoyEnBolivia()), pagina, porPagina),
    [filtro, pagina, porPagina],
  );
  const { estado, recargar } = usePedidoOnline(pedir, ERROR_AUDITORIA);
  return { estado, recargar, pagina, irAPagina };
}

/**
 * Lo que la tablet sabe nombrar: personas y sucursales de la base local, y los clientes de los
 * registros de esta página. Ropa, cobros y entregas no están en la tablet del admin.
 */
export function useNombresConocidos(estado: EstadoPedido<PaginaAuditoria>): NombresConocidos {
  const base = useBaseLocal();
  const cuentas = useCuentas();
  const sucursales = useSucursales();
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());

  const idsDeClientes = useMemo(
    () =>
      estado.tipo === 'listo'
        ? [...new Set(estado.datos.registros.filter((r) => r.tablaAfectada === 'clientes' && r.registroId).map((r) => r.registroId ?? ''))]
        : [],
    [estado],
  );

  useEffect(() => {
    if (!base) return;
    let vigente = true;
    nombresDeClientes(base, idsDeClientes)
      .then((mapa) => vigente && setClientes(mapa))
      .catch((error: unknown) => console.error('No se pudieron leer los nombres de los clientes.', error));
    return () => {
      vigente = false;
    };
  }, [base, idsDeClientes]);

  return useMemo(
    () => ({
      clientes,
      cuentas: new Map((cuentas ?? []).map((c) => [c.id, c.nombreCompleto])),
      sucursales: new Map((sucursales ?? []).map((s) => [s.id, s.nombre])),
    }),
    [clientes, cuentas, sucursales],
  );
}
