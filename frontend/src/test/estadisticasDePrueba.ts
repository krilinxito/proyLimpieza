/**
 * Respuestas de prueba de `/api/estadisticas/*` — SPEC-KRILINXI-015
 *
 * Cada función arma una respuesta **válida** según el contrato de SPEC-ALE186-008, y el test
 * cambia solo lo que le importa:
 *
 *     const servidor = simularEstadisticas({ ingresos: ingresosDePrueba({ total: '0.00', porSucursal: [] }) });
 *     renderEnRuta(<App />, '/estadisticas', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
 *     expect(servidor.pedidos[0]?.parametros).toEqual({ desde: '2026-10-16', hasta: '2026-10-16' });
 *
 * `simularEstadisticas` contesta cada ruta con su respuesta (las que no se pasan, con la de
 * prueba), o `'sin-conexion'` para todas. Las métricas que agreguen otras specs (volumen,
 * productividad) suman aquí su respuesta de prueba y su ruta.
 */
import { simularApi, type RespuestaFalsa } from './apiFalsa';

export const SUCURSAL_CENTRO = '00000000-0000-4000-8000-0000000000c1';

export function ingresosDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    desde: '2026-10-16',
    hasta: '2026-10-16',
    total: '125.50',
    porSucursal: [
      {
        sucursalId: SUCURSAL_CENTRO,
        sucursal: 'Centro',
        total: '125.50',
        porMetodo: { EFECTIVO: '100.00', QR: '25.50', TARJETA: '0.00', TRANSFERENCIA: '0.00' },
      },
    ],
    ...cambios,
  };
}

export function saldosDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    desde: '2000-01-01',
    hasta: '2026-10-16',
    total: '30.00',
    cantidad: 1,
    porAntiguedad: [
      { tramo: 'HASTA_7_DIAS', cantidad: 0, total: '0.00' },
      { tramo: 'DE_8_A_30_DIAS', cantidad: 0, total: '0.00' },
      { tramo: 'MAS_DE_30_DIAS', cantidad: 1, total: '30.00' },
    ],
    ordenes: [
      {
        ordenId: '00000000-0000-4000-8000-0000000000a1',
        numeroBoleta: '001234',
        cliente: 'Rosa Quispe',
        sucursalId: SUCURSAL_CENTRO,
        estado: 'LISTO',
        montoACobrar: '50.00',
        totalPagado: '20.00',
        saldoPendiente: '30.00',
        fechaEntrada: '2026-09-01T10:00:00.000Z',
        dias: 45,
      },
    ],
    ...cambios,
  };
}

export function sinRecogerDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    desde: '2000-01-01',
    hasta: '2026-10-16',
    cantidad: 1,
    porAntiguedad: [
      { tramo: 'HASTA_7_DIAS', cantidad: 1 },
      { tramo: 'DE_8_A_30_DIAS', cantidad: 0 },
      { tramo: 'MAS_DE_30_DIAS', cantidad: 0 },
    ],
    ordenes: [
      {
        ordenId: '00000000-0000-4000-8000-0000000000a2',
        numeroBoleta: '004321',
        cliente: 'Juan Mamani',
        telefono: '70555555',
        descripcion: '3 camisas',
        sucursal: 'Centro',
        fechaEntrada: '2026-10-14T10:00:00.000Z',
        fechaEstimadaSalida: null,
        precioTotal: '45.00',
        dias: 2,
      },
    ],
    ...cambios,
  };
}

type Respuestas = { ingresos?: RespuestaFalsa; saldos?: RespuestaFalsa; sinRecoger?: RespuestaFalsa };

const ok = (data: unknown): RespuestaFalsa => ({ status: 200, data });

export function simularEstadisticas(respuestas: Respuestas | 'sin-conexion' = {}) {
  return simularApi((pedido) => {
    if (respuestas === 'sin-conexion') return 'sin-conexion';
    switch (pedido.ruta) {
      case '/estadisticas/ingresos':
        return respuestas.ingresos ?? ok(ingresosDePrueba());
      case '/estadisticas/saldos':
        return respuestas.saldos ?? ok(saldosDePrueba());
      case '/estadisticas/sin-recoger':
        return respuestas.sinRecoger ?? ok(sinRecogerDePrueba());
      default:
        return { status: 404 };
    }
  });
}
