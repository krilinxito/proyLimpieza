/**
 * Respuestas de prueba de `/api/estadisticas/*` — SPEC-KRILINXI-015, con volumen, productividad
 * y clientes desde SPEC-KRILINXI-016
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

/** Tres días: el 15 con 4 boletas (1 anulada), el 16 sin ninguna. Los días en 0 vienen igual. */
export function volumenDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    desde: '2026-10-14',
    hasta: '2026-10-16',
    total: 6,
    anuladas: 1,
    porDia: [
      { fecha: '2026-10-14', ordenes: 2, anuladas: 0 },
      { fecha: '2026-10-15', ordenes: 4, anuladas: 1 },
      { fecha: '2026-10-16', ordenes: 0, anuladas: 0 },
    ],
    ...cambios,
  };
}

export const SUCURSAL_NORTE = '00000000-0000-4000-8000-0000000000c2';
const ANA = { id: '00000000-0000-4000-8000-0000000000e1', nombreCompleto: 'Ana Flores' };

/** Ana trabajó en dos sucursales: una fila por cada una (la regla del registro, SPEC-ALE186-012). */
export function productividadDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    desde: '2026-09-17',
    hasta: '2026-10-16',
    porEmpleado: [
      {
        usuario: ANA,
        sucursal: { id: SUCURSAL_CENTRO, nombre: 'Centro' },
        ordenesRecibidas: 12,
        cobros: 9,
        montoCobrado: '340.50',
        entregas: 7,
      },
      {
        usuario: ANA,
        sucursal: { id: SUCURSAL_NORTE, nombre: 'Norte' },
        ordenesRecibidas: 3,
        cobros: 1,
        montoCobrado: '20.00',
        entregas: 0,
      },
    ],
    ...cambios,
  };
}

/** Rosa vino 3 veces: 2 al Centro y 1 al Norte. `total` cuenta todos los clientes, no solo esta página. */
export function clientesDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    desde: '2026-09-17',
    hasta: '2026-10-16',
    pagina: 1,
    porPagina: 20,
    total: 1,
    clientes: [
      {
        cliente: { id: '00000000-0000-4000-8000-0000000000d1', nombre: 'Rosa Quispe', telefono: '70123456' },
        ordenes: 3,
        gastado: '150.00',
        ultimaVisita: '2026-10-15 18:30:00',
        porSucursal: [
          {
            sucursal: { id: SUCURSAL_CENTRO, nombre: 'Centro' },
            ordenes: 2,
            gastado: '100.00',
            ultimaVisita: '2026-10-15 18:30:00',
          },
          {
            sucursal: { id: SUCURSAL_NORTE, nombre: 'Norte' },
            ordenes: 1,
            gastado: '50.00',
            ultimaVisita: '2026-09-20 10:00:00',
          },
        ],
      },
    ],
    ...cambios,
  };
}

type Respuestas = {
  ingresos?: RespuestaFalsa;
  saldos?: RespuestaFalsa;
  sinRecoger?: RespuestaFalsa;
  volumen?: RespuestaFalsa;
  productividad?: RespuestaFalsa;
  clientes?: RespuestaFalsa;
};

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
      case '/estadisticas/volumen':
        return respuestas.volumen ?? ok(volumenDePrueba());
      case '/estadisticas/productividad':
        return respuestas.productividad ?? ok(productividadDePrueba());
      case '/estadisticas/clientes':
        return respuestas.clientes ?? ok(clientesDePrueba());
      default:
        return { status: 404 };
    }
  });
}
