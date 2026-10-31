/**
 * Registros de prueba de `GET /api/auditoria` — SPEC-KRILINXI-018
 *
 * `registroDePrueba` arma un registro válido del contrato (SPEC-ALE186-012) y cada test cambia
 * lo que le importa; `paginaDePrueba` los envuelve en una página:
 *
 *     const ropa = registroDePrueba({ accion: 'CREAR', tablaAfectada: 'ordenes' });
 *     simularApi(() => ({ status: 200, data: paginaDePrueba([ropa]) }));
 */
export const SUCURSAL_CENTRO = '00000000-0000-4000-8000-0000000000c1';
export const ROSA_CLIENTE = '00000000-0000-4000-8000-0000000000d1';
export const ELENA = { id: '00000000-0000-4000-8000-0000000000e2', nombreCompleto: 'Elena Choque', username: 'elena' };

export function registroDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    fecha: '2026-10-15 18:30:00',
    accion: 'CREAR',
    tablaAfectada: 'ordenes',
    registroId: crypto.randomUUID(),
    sucursalId: SUCURSAL_CENTRO,
    fechaDelHecho: '2026-10-15 18:30:00',
    revision: null,
    motivoReembolso: null,
    valoresAnteriores: null,
    usuario: ELENA,
    ...cambios,
  };
}

export function paginaDePrueba(registros: unknown[], cambios: Record<string, unknown> = {}) {
  return { desde: '2026-09-17', hasta: '2026-10-16', pagina: 1, porPagina: 20, total: registros.length, registros, ...cambios };
}
