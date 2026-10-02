import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ID_ENTREGA } from '../helpers/entregas.js';
import { IDS } from '../helpers/ordenes.js';
import { unicidadViolada } from '../helpers/postgres.js';

// Mismo enfoque que el test del model de pagos: el doble es el POOL, y el model
// de órdenes corre de verdad (también le pide su fila al pool). Cada test encola
// las respuestas de la base en el orden en que se piden.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const entregas = await import('../../src/models/entregas.model.js');

const FILA_ENTREGA = {
  id: ID_ENTREGA,
  orden_id: IDS.orden,
  sucursal_id: IDS.sucursal,
  fecha_entrega: '2026-10-03 17:30:00',
  tipo_retiro: 'CON_BOLETA',
  retirado_por_nombre: null,
  retirado_por_carnet: null,
  usuario_entrega_id: IDS.usuario,
  precio_final: '45.50',
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

const NUEVA = {
  id: ID_ENTREGA,
  ordenId: IDS.orden,
  tipoRetiro: 'CON_BOLETA',
  retiradoPorNombre: null,
  retiradoPorCarnet: null,
  usuarioEntregaId: IDS.usuario,
  precioFinal: null,
  fechaEntrega: null,
} as const;

const SIN_RESTRICCION = { sucursalId: null };
const SOLO_MI_SUCURSAL = { sucursalId: IDS.sucursal };

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

describe('Entregas model: crear — SPEC-ALE186-006', () => {
  it('inserta con el id del dispositivo en una sola consulta y traduce a camelCase', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    const resultado = await entregas.crear(NUEVA, SIN_RESTRICCION);

    expect(resultado).toEqual({
      tipo: 'creada',
      entrega: expect.objectContaining({ id: ID_ENTREGA, ordenId: IDS.orden, precioFinal: '45.50' }),
    });
    expect(llamada()[1][0]).toBe(ID_ENTREGA);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('pasa la orden a ENTREGADO y crea la entrega en la MISMA sentencia', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SIN_RESTRICCION);

    const [sql] = llamada();
    // Un CTE: el UPDATE de la orden y el INSERT de la entrega viajan juntos, y
    // la entrega se arma con lo que devolvió el UPDATE (FROM orden).
    expect(sql).toMatch(/WITH orden AS \(\s*UPDATE ordenes\s+SET estado = 'ENTREGADO'/);
    expect(sql).toMatch(/INSERT INTO entregas[\s\S]*FROM orden/);
    // Sin ON CONFLICT: un id repetido tiene que hacer fallar todo, UPDATE incluido.
    expect(sql).not.toContain('ON CONFLICT');
  });

  it('copia la sucursal de la orden, sin recibirla de nadie', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SIN_RESTRICCION);

    const [sql, valores] = llamada();
    expect(sql).toMatch(/SELECT \$1, orden\.id, orden\.sucursal_id/);
    expect(valores).not.toContain(IDS.sucursal);
  });

  it('solo entrega desde estados abiertos: RECIBIDO, EN_PROCESO o LISTO', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SIN_RESTRICCION);

    expect(entregas.ESTADOS_ENTREGABLES).toEqual(['RECIBIDO', 'EN_PROCESO', 'LISTO']);
    expect(llamada()[1]).toContainEqual(['RECIBIDO', 'EN_PROCESO', 'LISTO']);
  });

  it('sin precio final, deja que Postgres use el precio_total de la orden', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SIN_RESTRICCION);

    const [sql, valores] = llamada();
    expect(sql).toContain('COALESCE($7::numeric, orden.precio_total)');
    expect(valores[6]).toBeNull();
  });

  it('manda el precio final como decimal exacto, nunca como float', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear({ ...NUEVA, precioFinal: 5050 }, SIN_RESTRICCION);

    expect(llamada()[1][6]).toBe('50.50');
  });

  it('pasa la sucursal permitida como condición cuando la hay', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SOLO_MI_SUCURSAL);

    expect(llamada()[1].at(-1)).toBe(IDS.sucursal);
  });

  it('en un reintento devuelve la entrega que ya existía', async () => {
    // La orden ya está ENTREGADO, así que el UPDATE no encuentra nada.
    laBaseDevuelve([], [FILA_ENTREGA]);

    expect(await entregas.crear(NUEVA, SIN_RESTRICCION)).toMatchObject({
      tipo: 'existente',
      entrega: { id: ID_ENTREGA },
    });
  });

  it('un reintento que se cruzó con el original (id repetido) también es "existente"', async () => {
    query.mockRejectedValueOnce(unicidadViolada('entregas_pkey'));
    laBaseDevuelve([FILA_ENTREGA]);

    expect((await entregas.crear(NUEVA, SIN_RESTRICCION)).tipo).toBe('existente');
  });

  it('avisa que la orden no existe', async () => {
    laBaseDevuelve([], [], []);

    expect(await entregas.crear(NUEVA, SIN_RESTRICCION)).toEqual({ tipo: 'orden-no-encontrada' });
  });

  it('una orden de otra sucursal cuenta como no encontrada', async () => {
    laBaseDevuelve([], [], [{ ...FILA_ORDEN, sucursal_id: IDS.otraSucursal }]);

    expect(await entregas.crear(NUEVA, SOLO_MI_SUCURSAL)).toEqual({ tipo: 'orden-no-encontrada' });
  });

  it('avisa que la orden está anulada', async () => {
    laBaseDevuelve([], [], [{ ...FILA_ORDEN, estado: 'ANULADO' }]);

    expect(await entregas.crear(NUEVA, SIN_RESTRICCION)).toMatchObject({
      tipo: 'orden-anulada',
      orden: { numeroBoleta: '001234' },
    });
  });

  it('avisa que la orden ya fue entregada con otra entrega', async () => {
    laBaseDevuelve([], [], [{ ...FILA_ORDEN, estado: 'ENTREGADO' }]);

    expect(await entregas.crear(NUEVA, SIN_RESTRICCION)).toMatchObject({ tipo: 'orden-ya-entregada' });
  });

  it('una orden con entrega previa aunque no figure ENTREGADO también está ya entregada', async () => {
    // Datos inconsistentes de antes de esta spec: la UNIQUE (orden_id) lo frena.
    query.mockRejectedValueOnce(unicidadViolada('entregas_orden_id_key'));
    laBaseDevuelve([], [FILA_ORDEN]);

    expect(await entregas.crear(NUEVA, SIN_RESTRICCION)).toMatchObject({ tipo: 'orden-ya-entregada' });
  });

  it('cualquier otro error de la base sigue de largo', async () => {
    query.mockRejectedValueOnce(new Error('se cayó la conexión'));

    await expect(entregas.crear(NUEVA, SIN_RESTRICCION)).rejects.toThrow('se cayó la conexión');
  });

  it('falla en voz alta si no se insertó y no encuentra el motivo', async () => {
    laBaseDevuelve([], [], [FILA_ORDEN]);

    await expect(entregas.crear(NUEVA, SIN_RESTRICCION)).rejects.toThrow(/no se insertó/);
  });
});
