/**
 * Respuestas de prueba de `GET /api/ordenes` — SPEC-KRILINXI-041
 *
 * `boletaDePrueba` arma una boleta válida del contrato (SPEC-KRILINXI-040) y cada test cambia lo
 * que le importa; `paginaDeBoletas` las envuelve en una página, como las serializa el backend:
 *
 *     const entregada = boletaDePrueba({ estado: 'ENTREGADO', precioFinal: '60.00', saldo: '0.00' });
 *     simularApi(() => ({ status: 200, data: paginaDeBoletas([entregada]) }));
 *
 * Los montos son texto (`"30.25"`) porque los suma Postgres. Misma idea que `auditoriaDePrueba`.
 */
export const SUCURSAL_CENTRO = '00000000-0000-4000-8000-0000000000c1';
export const SUCURSAL_SUR = '00000000-0000-4000-8000-0000000000c2';

export function boletaDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    numeroBoleta: '001234',
    sucursal: { id: SUCURSAL_CENTRO, nombre: 'Centro' },
    cliente: { id: crypto.randomUUID(), nombre: 'Rosa Quispe', telefono: '70123456' },
    descripcion: '2 camisas, 1 terno',
    estado: 'RECIBIDO',
    fechaEntrada: '2026-10-15 18:30:00',
    fechaEstimadaSalida: '2026-10-18',
    precioTotal: '50.00',
    precioFinal: null,
    retiro: null,
    pagado: '20.00',
    saldo: '30.00',
    // Sin renglones, como una boleta de antes de SPEC-KRILINXI-068. Con ellos: `renglones: [renglonDePrueba()]`.
    renglones: [],
    ...cambios,
  };
}

/** Un renglón de una boleta del historial (SPEC-KRILINXI-068), con los números como texto, como los serializa el backend. */
export function renglonDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    momento: 'INGRESO',
    descripcion: 'Camisa',
    cantidad: '2.00',
    precioUnitario: '15.00',
    subtotal: '30.00',
    ...cambios,
  };
}

export function paginaDeBoletas(boletas: unknown[], cambios: Record<string, unknown> = {}) {
  return { desde: null, hasta: null, pagina: 1, porPagina: 20, total: boletas.length, boletas, ...cambios };
}
