import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDS } from '../helpers/ordenes.js';
import { ID_PAGO } from '../helpers/pagos.js';

// Como en órdenes, el doble es el POOL: se prueba qué SQL arma el model, con qué
// parámetros, y qué hace con lo que devuelve la base. El model de órdenes NO se
// reemplaza: `buscarPorId` corre de verdad y también pide su fila al pool, así
// que cada test encola las respuestas en el orden en que se piden.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const pagos = await import('../../src/models/pagos.model.js');

const FILA_PAGO = {
  id: ID_PAGO,
  orden_id: IDS.orden,
  sucursal_id: IDS.sucursal,
  monto: '20.00',
  tipo: 'ADELANTO',
  metodo: 'EFECTIVO',
  fecha_pago: '2026-10-02 10:15:00',
  usuario_id: IDS.usuario,
};

const FILA_ORDEN = {
  id: IDS.orden,
  numero_boleta: '001234',
  cliente_id: IDS.cliente,
  sucursal_id: IDS.sucursal,
  usuario_recepcion_id: IDS.usuario,
  descripcion: '2 camisas, 1 terno',
  fecha_entrada: '2026-09-30 10:15:00',
  fecha_estimada_salida: null,
  precio_total: '45.50',
  estado: 'LISTO',
};

const NUEVO = {
  id: ID_PAGO,
  ordenId: IDS.orden,
  monto: 2000,
  tipo: 'ADELANTO',
  metodo: 'EFECTIVO',
  usuarioId: IDS.usuario,
  fechaPago: '2026-10-02T14:15:00Z',
} as const;

const SIN_RESTRICCION = { sucursalId: null };
const SOLO_MI_SUCURSAL = { sucursalId: IDS.sucursal };

/** Respuestas del pool, en el orden en que el model las va a pedir. */
function laBaseDevuelve(...filas: unknown[][]) {
  for (const rows of filas) query.mockResolvedValueOnce({ rows });
}

function llamada(n = 0): [string, unknown[]] {
  const [sql, valores] = (query.mock.calls[n] ?? []) as [string, unknown[]];
  return [sql, valores];
}

beforeEach(() => {
  query.mockReset();
});

describe('Pagos model: crear — SPEC-ALE186-005', () => {
  it('inserta con el id del dispositivo y traduce la fila a camelCase', async () => {
    laBaseDevuelve([FILA_PAGO]);

    const resultado = await pagos.crear(NUEVO, SIN_RESTRICCION);

    expect(resultado).toEqual({
      tipo: 'creado',
      pago: expect.objectContaining({ id: ID_PAGO, ordenId: IDS.orden, monto: '20.00' }),
    });
    expect(llamada()[1][0]).toBe(ID_PAGO);
    // Una sola consulta: en el camino feliz no se lee nada aparte.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('copia la sucursal de la orden en la misma sentencia, sin recibirla de nadie', async () => {
    laBaseDevuelve([FILA_PAGO]);

    await pagos.crear(NUEVO, SIN_RESTRICCION);

    const [sql, valores] = llamada();
    // Lo que se inserta como sucursal_id es la columna de la orden...
    expect(sql).toMatch(/SELECT \$1, o\.id, o\.sucursal_id/);
    // ...y ninguno de los parámetros es una sucursal (con restricción nula).
    expect(valores).not.toContain(IDS.sucursal);
  });

  it('comprueba en el mismo INSERT que la orden no esté anulada, y la bloquea', async () => {
    laBaseDevuelve([FILA_PAGO]);

    await pagos.crear(NUEVO, SIN_RESTRICCION);

    const [sql] = llamada();
    expect(sql).toContain("o.estado <> 'ANULADO'");
    expect(sql).toContain('FOR SHARE');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
  });

  it('manda el monto como decimal exacto, nunca como float', async () => {
    laBaseDevuelve([FILA_PAGO]);

    await pagos.crear({ ...NUEVO, monto: 1050 }, SIN_RESTRICCION);

    expect(llamada()[1]).toContain('10.50');
  });

  it('pasa la sucursal permitida como condición cuando la hay', async () => {
    laBaseDevuelve([FILA_PAGO]);

    await pagos.crear(NUEVO, SOLO_MI_SUCURSAL);

    expect(llamada()[1].at(-1)).toBe(IDS.sucursal);
  });

  it('en un reintento devuelve el pago que ya existía', async () => {
    laBaseDevuelve([], [FILA_PAGO]);

    const resultado = await pagos.crear(NUEVO, SIN_RESTRICCION);

    expect(resultado).toMatchObject({ tipo: 'existente', pago: { id: ID_PAGO } });
  });

  it('el reintento gana aunque la orden se haya anulado después del cobro', async () => {
    // El SELECT no devuelve la orden (ya está anulada), pero el pago existe:
    // ese cobro se registró antes, así que es un reintento, no un cobro nuevo.
    laBaseDevuelve([], [FILA_PAGO], [{ ...FILA_ORDEN, estado: 'ANULADO' }]);

    const resultado = await pagos.crear(NUEVO, SIN_RESTRICCION);

    expect(resultado.tipo).toBe('existente');
  });

  it('avisa que la orden no existe', async () => {
    laBaseDevuelve([], [], []);

    expect(await pagos.crear(NUEVO, SIN_RESTRICCION)).toEqual({ tipo: 'orden-no-encontrada' });
  });

  it('una orden de otra sucursal cuenta como no encontrada', async () => {
    laBaseDevuelve([], [], [{ ...FILA_ORDEN, sucursal_id: IDS.otraSucursal }]);

    expect(await pagos.crear(NUEVO, SOLO_MI_SUCURSAL)).toEqual({ tipo: 'orden-no-encontrada' });
  });

  it('avisa que la orden está anulada, con la orden para poder nombrarla', async () => {
    laBaseDevuelve([], [], [{ ...FILA_ORDEN, estado: 'ANULADO' }]);

    const resultado = await pagos.crear(NUEVO, SIN_RESTRICCION);

    expect(resultado).toMatchObject({ tipo: 'orden-anulada', orden: { numeroBoleta: '001234' } });
  });

  it('falla en voz alta si no se insertó y no encuentra el motivo', async () => {
    laBaseDevuelve([], [], [FILA_ORDEN]);

    await expect(pagos.crear(NUEVO, SIN_RESTRICCION)).rejects.toThrow(/no se insertó/);
  });
});
