import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hoyEnElNegocio } from '../../src/utils/periodo.js';
import { expectApiError, testApi } from '../helpers/api.js';
import { IDS } from '../helpers/ordenes.js';
import { conSesion } from '../helpers/usuarios.js';

// El controller con el model reemplazado: qué período resuelve, qué valida, quién
// puede entrar y qué forma tiene la respuesta. Que las sumas den bien lo prueba
// `tests/db/estadisticas.db.test.ts`, contra Postgres real.
//
// Mock parcial: se reemplazan las consultas y se conserva ZONA_NEGOCIO, que el
// controller usa para saber qué día es hoy.
vi.mock('../../src/models/estadisticas.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/estadisticas.model.js')>()),
  ingresos: vi.fn(),
  saldos: vi.fn(),
  sinRecoger: vi.fn(),
}));

const modelo = await import('../../src/models/estadisticas.model.js');
const ingresos = vi.mocked(modelo.ingresos);
const saldos = vi.mocked(modelo.saldos);
const sinRecoger = vi.mocked(modelo.sinRecoger);

const ADMIN = conSesion({ rol: 'ADMIN', sucursalId: null });
const ENDPOINTS = ['/ingresos', '/saldos', '/sin-recoger'] as const;

const TRAMOS_EN_CERO = [
  { tramo: 'HASTA_7_DIAS', cantidad: 0, total: '0.00' },
  { tramo: 'DE_8_A_30_DIAS', cantidad: 0, total: '0.00' },
  { tramo: 'MAS_DE_30_DIAS', cantidad: 0, total: '0.00' },
] as const;

function pedir(endpoint: string, query: Record<string, string> = {}, sesion = ADMIN) {
  return testApi().get(`/api/estadisticas${endpoint}`).query(query).set(sesion);
}

/** El período con que el controller llamó al model en la última petición. */
function periodoPedido() {
  return (ingresos.mock.calls.at(-1) ?? saldos.mock.calls.at(-1) ?? sinRecoger.mock.calls.at(-1))?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  ingresos.mockResolvedValue({ total: '0.00', porSucursal: [] });
  saldos.mockResolvedValue({ total: '0.00', cantidad: 0, porAntiguedad: [...TRAMOS_EN_CERO], ordenes: [] });
  sinRecoger.mockResolvedValue({
    cantidad: 0,
    porAntiguedad: TRAMOS_EN_CERO.map(({ tramo, cantidad }) => ({ tramo, cantidad })),
    ordenes: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Estadísticas: quién puede verlas — SPEC-ALE186-008', () => {
  it.each(ENDPOINTS)('%s responde 401 sin un token válido', async (endpoint) => {
    const res = await testApi().get(`/api/estadisticas${endpoint}`);

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
  });

  it.each(ENDPOINTS)('%s responde 403 a un EMPLEADO, sin llegar al model', async (endpoint) => {
    const res = await pedir(endpoint, {}, conSesion());

    expectApiError(res, { status: 403, codigo: 'SIN_PERMISO' });
    expect(ingresos).not.toHaveBeenCalled();
    expect(saldos).not.toHaveBeenCalled();
    expect(sinRecoger).not.toHaveBeenCalled();
  });
});

describe('Estadísticas: el período — SPEC-ALE186-008', () => {
  it.each(ENDPOINTS)('%s sin fechas usa los últimos 30 días contando hoy, y los devuelve', async (endpoint) => {
    // Solo se falsea Date: los timers de verdad los necesita supertest.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2025-06-30T15:00:00Z'));

    const res = await pedir(endpoint);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ desde: '2025-06-01', hasta: '2025-06-30' });
    expect(periodoPedido()).toEqual({ desde: '2025-06-01', hasta: '2025-06-30', sucursalId: null });
  });

  it('"hoy" es el día de Bolivia: a las 22:00 en La Paz ya es mañana en UTC, pero no acá', () => {
    // 22:00 del 30 de junio en Bolivia = 02:00 del 1 de julio en UTC.
    expect(hoyEnElNegocio(new Date('2025-07-01T02:00:00Z'))).toBe('2025-06-30');
  });

  it('saldos y sin-recoger reciben el "hoy" del negocio para contar los días', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2025-07-01T02:00:00Z'));

    await pedir('/saldos');
    await pedir('/sin-recoger');

    expect(saldos.mock.calls.at(-1)?.[1]).toBe('2025-06-30');
    expect(sinRecoger.mock.calls.at(-1)?.[1]).toBe('2025-06-30');
  });

  it('con solo "hasta", usa los 30 días que terminan ese día', async () => {
    await pedir('/ingresos', { hasta: '2025-03-15' });

    expect(periodoPedido()).toMatchObject({ desde: '2025-02-14', hasta: '2025-03-15' });
  });

  it('pasa desde, hasta y sucursal_id tal cual cuando vienen', async () => {
    const res = await pedir('/ingresos', { desde: '2025-01-01', hasta: '2025-01-31', sucursal_id: IDS.sucursal });

    expect(res.body).toMatchObject({ desde: '2025-01-01', hasta: '2025-01-31' });
    expect(periodoPedido()).toEqual({ desde: '2025-01-01', hasta: '2025-01-31', sucursalId: IDS.sucursal });
  });

  it('acepta un solo día: desde igual a hasta', async () => {
    const res = await pedir('/ingresos', { desde: '2025-01-15', hasta: '2025-01-15' });

    expect(res.status).toBe(200);
  });

  it.each([
    ['desde no es una fecha', { desde: 'ayer' }],
    ['hasta no existe en el calendario', { hasta: '2025-02-30' }],
    ['desde viene con hora', { desde: '2025-01-01T00:00:00Z' }],
    ['desde es posterior a hasta', { desde: '2025-02-01', hasta: '2025-01-31' }],
    ['sucursal_id no es un UUID', { sucursal_id: 'Centro' }],
  ])('responde 400 cuando %s', async (_caso, query) => {
    const res = await pedir('/ingresos', query);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(ingresos).not.toHaveBeenCalled();
  });

  it('responde 400 cuando una fecha viene repetida en la query', async () => {
    const res = await testApi().get('/api/estadisticas/ingresos?desde=2025-01-01&desde=2025-01-02').set(ADMIN);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });
});

describe('Estadísticas: la forma de las respuestas — SPEC-ALE186-008', () => {
  it('ingresos devuelve el período y lo que calculó el model, sin tocar los montos', async () => {
    const porSucursal = [
      {
        sucursalId: IDS.sucursal,
        sucursal: 'Centro',
        total: '20.00',
        porMetodo: { EFECTIVO: '14.50', QR: '5.50', TARJETA: '0.00', TRANSFERENCIA: '0.00' },
      },
    ];
    ingresos.mockResolvedValue({ total: '20.00', porSucursal });

    const res = await pedir('/ingresos', { desde: '2025-04-01', hasta: '2025-04-30' });

    expect(res.body).toEqual({ desde: '2025-04-01', hasta: '2025-04-30', total: '20.00', porSucursal });
  });

  it('saldos devuelve total, cantidad, los tres tramos y las órdenes', async () => {
    const res = await pedir('/saldos', { desde: '2025-04-01', hasta: '2025-04-30' });

    expect(res.body).toEqual({
      desde: '2025-04-01',
      hasta: '2025-04-30',
      total: '0.00',
      cantidad: 0,
      porAntiguedad: TRAMOS_EN_CERO,
      ordenes: [],
    });
  });

  it('sin-recoger devuelve cantidad, los tres tramos y las órdenes', async () => {
    const res = await pedir('/sin-recoger', { desde: '2025-04-01', hasta: '2025-04-30' });

    expect(Object.keys(res.body).sort()).toEqual(['cantidad', 'desde', 'hasta', 'ordenes', 'porAntiguedad']);
    expect(res.body.porAntiguedad.map((t: { tramo: string }) => t.tramo)).toEqual([
      'HASTA_7_DIAS',
      'DE_8_A_30_DIAS',
      'MAS_DE_30_DIAS',
    ]);
  });
});
