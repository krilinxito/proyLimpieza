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
  motivo_reembolso: null,
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
  estado: 'RECIBIDO',
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
  motivoReembolso: null,
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
    expect(sql).toMatch(/WITH orden AS \(\s*UPDATE ordenes\s+SET estado = CASE WHEN \$11::text IS NULL THEN 'ENTREGADO'/);
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

  it('solo entrega desde estados abiertos: RECIBIDO (SPEC-KRILINXI-067)', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SIN_RESTRICCION);

    expect(entregas.ESTADOS_ENTREGABLES).toEqual(['RECIBIDO']);
    expect(llamada()[1]).toContainEqual(['RECIBIDO']);
  });

  it('guarda el precio final que calculó el UPDATE, no uno que venga de afuera (SPEC-KRILINXI-068)', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SIN_RESTRICCION);

    const [sql, valores] = llamada();
    expect(sql).toMatch(/SELECT \$1, orden\.id, orden\.sucursal_id, \$3, \$4, \$5, \$6,\s+orden\.precio_final,/);
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

    // $10 del INSERT. Detrás van los de la auditoría (SPEC-ALE186-010).
    expect(llamada()[1][9]).toBe(IDS.sucursal);
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
    // La orden está bien y no falta cobrar nada: no hay ningún motivo para que no se haya insertado.
    laBaseDevuelve([], [], [FILA_ORDEN], [{ saldo: '0.00' }]);

    await expect(entregas.crear(NUEVA, SIN_RESTRICCION)).rejects.toThrow(/no se insertó/);
  });
});

describe('Entregas model: solo con la boleta pagada — SPEC-KRILINXI-056', () => {
  it('la condición del saldo va dentro del mismo UPDATE que pasa la orden a ENTREGADO', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SIN_RESTRICCION);

    const [sql] = llamada(0);
    // Del UPDATE de la orden hasta su RETURNING: ahí, y no en otra parte, tiene que estar la condición.
    const update = /UPDATE ordenes[\s\S]*?RETURNING/.exec(sql)?.[0] ?? '';
    expect(update.replace(/\s+/g, ' ')).toMatch(
      /AND \(\$11::text IS NOT NULL OR \(ordenes\.precio_total \+ .*\) <= COALESCE\(\(SELECT SUM\(p\.monto\) FROM pagos p WHERE p\.orden_id = ordenes\.id\), 0\)\)/,
    );
  });

  it('si no se insertó porque falta cobrar, devuelve saldo-pendiente con lo que falta', async () => {
    laBaseDevuelve([], [], [FILA_ORDEN], [{ saldo: '25.50' }]);

    expect(await entregas.crear(NUEVA, SIN_RESTRICCION)).toMatchObject({
      tipo: 'saldo-pendiente',
      saldo: '25.50',
      orden: { numeroBoleta: '001234' },
    });
  });

  it('para calcular lo que falta usa el precio con los cargos, no el que vino (SPEC-KRILINXI-068)', async () => {
    laBaseDevuelve([], [], [FILA_ORDEN], [{ precio_final: '50.00', saldo: '4.50' }]);

    expect(await entregas.crear({ ...NUEVA, precioFinal: 5000 }, SIN_RESTRICCION)).toMatchObject({
      tipo: 'saldo-pendiente',
      saldo: '4.50',
    });
    const [sql, valores] = llamada(3);
    expect(sql).toContain("i.momento = 'ENTREGA'");
    expect(valores).toEqual([IDS.orden]);
  });

  it('una anulada o ya entregada se explica por eso, no por el saldo', async () => {
    laBaseDevuelve([], [], [{ ...FILA_ORDEN, estado: 'ANULADO' }]);
    expect(await entregas.crear(NUEVA, SIN_RESTRICCION)).toMatchObject({ tipo: 'orden-anulada' });
    expect(query).toHaveBeenCalledTimes(3);
  });
});

describe('Entregas model: el precio final son el total y los cargos — SPEC-KRILINXI-068', () => {
  it('el UPDATE calcula el precio final con los renglones de ENTREGA y lo devuelve para el INSERT', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SIN_RESTRICCION);

    const update = (/UPDATE ordenes[\s\S]*?\)\s*,\s*escrita/.exec(llamada()[0])?.[0] ?? '').replace(/\s+/g, ' ');
    expect(update).toContain("FROM orden_items i WHERE i.orden_id = ordenes.id AND i.momento = 'ENTREGA'");
    expect(update).toContain('round(i.cantidad * i.precio_unitario, 2)');
    expect(update).toMatch(/RETURNING id, sucursal_id, CASE WHEN \$11::text IS NULL THEN \(ordenes\.precio_total \+ .*\) ELSE .* END AS precio_final/);
  });

  it('si la tablet manda un precio final, es una condición más: tiene que ser el calculado', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear({ ...NUEVA, precioFinal: 6050 }, SIN_RESTRICCION);

    const [sql, valores] = llamada();
    expect(sql.replace(/\s+/g, ' ')).toMatch(/AND \(\$11::text IS NOT NULL OR \$7::numeric IS NULL OR \$7::numeric = \(ordenes\.precio_total \+/);
    // Como decimal exacto, nunca como float.
    expect(valores[6]).toBe('60.50');
  });

  it('si el precio que vino no es el calculado, devuelve precio-distinto con el que corresponde', async () => {
    laBaseDevuelve([], [], [FILA_ORDEN], [{ precio_final: '60.50', saldo: '15.00' }]);

    expect(await entregas.crear({ ...NUEVA, precioFinal: 4550 }, SIN_RESTRICCION)).toMatchObject({
      tipo: 'precio-distinto',
      precioFinal: '60.50',
      orden: { numeroBoleta: '001234' },
    });
  });

  it('el precio distinto se explica antes que el saldo: lo que "falta" depende del precio', async () => {
    laBaseDevuelve([], [], [FILA_ORDEN], [{ precio_final: '60.50', saldo: '0.00' }]);

    expect(await entregas.crear({ ...NUEVA, precioFinal: 6000 }, SIN_RESTRICCION)).toMatchObject({
      tipo: 'precio-distinto',
    });
  });

  it('sin precio de la tablet no hay nada que comparar: solo cuenta el saldo', async () => {
    laBaseDevuelve([], [], [FILA_ORDEN], [{ precio_final: '60.50', saldo: '15.00' }]);

    expect(await entregas.crear(NUEVA, SIN_RESTRICCION)).toMatchObject({ tipo: 'saldo-pendiente', saldo: '15.00' });
  });
});

describe('Entregas model: entregar sin cobrar (reembolso) — SPEC-KRILINXI-070', () => {
  const REEMBOLSO = { ...NUEVA, motivoReembolso: 'Reclamó por una mancha' };

  it('el motivo viaja como parámetro $11 y se guarda en la columna motivo_reembolso', async () => {
    laBaseDevuelve([{ ...FILA_ENTREGA, precio_final: '20.00', motivo_reembolso: 'Reclamó por una mancha' }]);

    const resultado = await entregas.crear(REEMBOLSO, SIN_RESTRICCION, 'reembolso');

    expect(resultado).toMatchObject({ tipo: 'creada', entrega: { motivoReembolso: 'Reclamó por una mancha' } });
    const [sql, valores] = llamada();
    expect(valores[10]).toBe('Reclamó por una mancha');
    expect(sql).toContain('motivo_reembolso');
    expect(sql).toContain("'REEMBOLSADO'::estado_orden");
  });

  it('el precio final de un reembolso es lo ya cobrado, en la misma sentencia que deja la orden REEMBOLSADO', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(REEMBOLSO, SIN_RESTRICCION, 'reembolso');

    const update = (/UPDATE ordenes[\s\S]*?\)\s*,\s*escrita/.exec(llamada()[0])?.[0] ?? '').replace(/\s+/g, ' ');
    expect(update).toContain(
      'ELSE COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = ordenes.id), 0) END AS precio_final',
    );
  });

  it('la marca de revisión llega a la fila de auditoría', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(REEMBOLSO, SIN_RESTRICCION, 'reembolso');

    const [sql, valores] = llamada();
    expect(sql).toContain(', revision');
    expect(valores.at(-1)).toBe('reembolso');
  });

  it('la entrega común sigue sin motivo: $11 es null y el SQL conserva la comprobación del saldo y del precio', async () => {
    laBaseDevuelve([FILA_ENTREGA]);

    await entregas.crear(NUEVA, SIN_RESTRICCION);

    const [sql, valores] = llamada();
    expect(valores[10]).toBeNull();
    expect(sql.replace(/\s+/g, ' ')).toContain('AND ($11::text IS NOT NULL OR $7::numeric IS NULL');
  });

  it('un reintento con el mismo id responde existente, también siendo reembolso', async () => {
    laBaseDevuelve([], [{ ...FILA_ENTREGA, motivo_reembolso: 'Reclamó por una mancha' }]);

    expect(await entregas.crear(REEMBOLSO, SIN_RESTRICCION)).toMatchObject({ tipo: 'existente' });
  });

  it('una orden anulada rechaza el reembolso, y no se explica por precio ni por saldo', async () => {
    laBaseDevuelve([], [], [{ ...FILA_ORDEN, estado: 'ANULADO' }]);

    expect(await entregas.crear(REEMBOLSO, SIN_RESTRICCION)).toMatchObject({ tipo: 'orden-anulada' });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('una orden ya entregada o ya reembolsada rechaza el reembolso', async () => {
    for (const estado of ['ENTREGADO', 'REEMBOLSADO']) {
      query.mockReset();
      laBaseDevuelve([], [], [{ ...FILA_ORDEN, estado }]);
      expect(await entregas.crear(REEMBOLSO, SIN_RESTRICCION)).toMatchObject({ tipo: 'orden-ya-entregada' });
    }
  });

  it('un reembolso no consulta el precio ni el saldo: si no se insertó y no hay otro motivo, es un error', async () => {
    laBaseDevuelve([], [], [FILA_ORDEN]);

    await expect(entregas.crear(REEMBOLSO, SIN_RESTRICCION)).rejects.toThrow('no se insertó');
    // La entrega, el reintento por id y la orden: sin la consulta de cuentas (precio/saldo).
    expect(query).toHaveBeenCalledTimes(3);
  });
});
