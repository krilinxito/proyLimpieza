import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDS } from '../helpers/ordenes.js';
import { ID_RENGLON } from '../helpers/ordenItems.js';

// Como en pagos, el doble es el POOL. Lo nuevo es que este model escribe dentro de una transacción, con una conexión
// propia (`pool.connect()`): el doble de esa conexión anota cada sentencia en `enLaConexion`, así el test puede mirar
// el orden (BEGIN, bloqueo, INSERT, COMMIT). Lo que se lee DESPUÉS, para explicar un rechazo, va por `pool.query`.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const connect = vi.mocked(pool.connect) as unknown as ReturnType<typeof vi.fn>;
const ordenItems = await import('../../src/models/ordenItems.model.js');

const enLaConexion = vi.fn();
const release = vi.fn();

const FILA_RENGLON = {
  id: ID_RENGLON,
  orden_id: IDS.orden,
  sucursal_id: IDS.sucursal,
  momento: 'INGRESO',
  posicion: 0,
  descripcion: 'Camisa',
  cantidad: '2.00',
  precio_unitario: '15.00',
};

const FILA_ORDEN = {
  id: IDS.orden,
  numero_boleta: '001234',
  cliente_id: IDS.cliente,
  sucursal_id: IDS.sucursal,
  usuario_recepcion_id: IDS.usuario,
  descripcion: '2 Camisa',
  fecha_entrada: '2026-09-30 10:15:00',
  fecha_estimada_salida: null,
  precio_total: '30.00',
  estado: 'RECIBIDO',
};

const NUEVO = {
  id: ID_RENGLON,
  ordenId: IDS.orden,
  momento: 'INGRESO',
  posicion: 0,
  descripcion: 'Camisa',
  cantidad: 200,
  precioUnitario: 1500,
  usuarioId: IDS.usuario,
} as const;

const SIN_RESTRICCION = { sucursalId: null };

/** Lo que devuelve el INSERT dentro de la transacción (las demás sentencias de la conexión no devuelven filas). */
function elInsertDevuelve(filas: unknown[]) {
  enLaConexion.mockImplementation(async (sql: string) => ({ rows: sql.includes('INSERT INTO orden_items') ? filas : [] }));
}

/** Lo que devuelve la base a lo que se lee después, en el orden en que se pide. */
function despuesLaBaseDevuelve(...filas: unknown[][]) {
  for (const rows of filas) query.mockResolvedValueOnce({ rows });
}

function sentencias(): string[] {
  return enLaConexion.mock.calls.map(([sql]) => String(sql).trim());
}

function elInsert(): [string, unknown[]] {
  const llamada = enLaConexion.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO orden_items'));
  return (llamada ?? ['', []]) as [string, unknown[]];
}

beforeEach(() => {
  query.mockReset();
  enLaConexion.mockReset();
  release.mockReset();
  connect.mockReset();
  connect.mockResolvedValue({ query: enLaConexion, release });
});

describe('OrdenItems model: crear — SPEC-KRILINXI-068', () => {
  it('inserta con el id del dispositivo y traduce a camelCase', async () => {
    elInsertDevuelve([FILA_RENGLON]);

    const resultado = await ordenItems.crear(NUEVO, SIN_RESTRICCION);

    expect(resultado).toEqual({
      tipo: 'creado',
      item: {
        id: ID_RENGLON,
        ordenId: IDS.orden,
        sucursalId: IDS.sucursal,
        momento: 'INGRESO',
        posicion: 0,
        descripcion: 'Camisa',
        cantidad: '2.00',
        precioUnitario: '15.00',
      },
    });
    expect(elInsert()[1][0]).toBe(ID_RENGLON);
    expect(query).not.toHaveBeenCalled();
  });

  it('primero bloquea la orden y después inserta, en una sola transacción', async () => {
    elInsertDevuelve([FILA_RENGLON]);

    await ordenItems.crear(NUEVO, SIN_RESTRICCION);

    const [begin, bloqueo, insert, commit] = sentencias();
    expect(begin).toBe('BEGIN');
    expect(bloqueo).toBe('SELECT id FROM ordenes WHERE id = $1 FOR UPDATE');
    expect(enLaConexion.mock.calls[1]?.[1]).toEqual([IDS.orden]);
    expect(insert).toMatch(/INSERT INTO orden_items/);
    expect(commit).toBe('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('si algo falla adentro, deshace la transacción y devuelve la conexión', async () => {
    enLaConexion.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO orden_items')) throw new Error('se cayó la base');
      return { rows: [] };
    });

    await expect(ordenItems.crear(NUEVO, SIN_RESTRICCION)).rejects.toThrow('se cayó la base');
    expect(sentencias()).toContain('ROLLBACK');
    expect(sentencias()).not.toContain('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('copia la sucursal de la orden, sin recibirla de nadie, y la auditoría va en la misma sentencia', async () => {
    elInsertDevuelve([FILA_RENGLON]);

    await ordenItems.crear(NUEVO, SIN_RESTRICCION);

    const [sql, valores] = elInsert();
    expect(sql).toMatch(/SELECT \$1, o\.id, o\.sucursal_id/);
    expect(valores).not.toContain(IDS.sucursal);
    expect(sql).toMatch(/INSERT INTO auditoria/);
    expect(valores).toContain('orden_items');
    expect(valores).toContain('CREAR');
  });

  it('manda la cantidad y el precio como decimales exactos, nunca como float', async () => {
    elInsertDevuelve([FILA_RENGLON]);

    await ordenItems.crear({ ...NUEVO, cantidad: 250, precioUnitario: 333 }, SIN_RESTRICCION);

    const [, valores] = elInsert();
    expect(valores[4]).toBe('2.50');
    expect(valores[5]).toBe('3.33');
  });

  it('solo en órdenes abiertas, y con la regla del total solo para los renglones de INGRESO', async () => {
    elInsertDevuelve([FILA_RENGLON]);

    await ordenItems.crear(NUEVO, SIN_RESTRICCION);

    const [sql, valores] = elInsert();
    expect(valores).toContainEqual(['RECIBIDO']);
    const plano = sql.replace(/\s+/g, ' ');
    expect(plano).toContain("AND ($3::momento_item = 'ENTREGA' OR COALESCE((SELECT SUM(round(i.cantidad * i.precio_unitario, 2))");
    expect(plano).toContain("i.momento = 'INGRESO'), 0) + round($5::numeric * $6::numeric, 2) <= o.precio_total)");
  });

  it('pasa la sucursal permitida como condición cuando la hay', async () => {
    elInsertDevuelve([FILA_RENGLON]);

    await ordenItems.crear(NUEVO, { sucursalId: IDS.sucursal });

    expect(elInsert()[1][7]).toBe(IDS.sucursal);
  });

  it('en un reintento devuelve el renglón que ya existía', async () => {
    elInsertDevuelve([]);
    despuesLaBaseDevuelve([FILA_RENGLON]);

    expect(await ordenItems.crear(NUEVO, SIN_RESTRICCION)).toMatchObject({ tipo: 'existente', item: { id: ID_RENGLON } });
    expect(elInsert()[0]).toContain('ON CONFLICT (id) DO NOTHING');
  });

  it('avisa que la orden no existe, o que es de otra sucursal', async () => {
    elInsertDevuelve([]);
    despuesLaBaseDevuelve([], []);
    expect(await ordenItems.crear(NUEVO, SIN_RESTRICCION)).toEqual({ tipo: 'orden-no-encontrada' });

    elInsertDevuelve([]);
    despuesLaBaseDevuelve([], [{ ...FILA_ORDEN, sucursal_id: IDS.otraSucursal }]);
    expect(await ordenItems.crear(NUEVO, { sucursalId: IDS.sucursal })).toEqual({ tipo: 'orden-no-encontrada' });
  });

  it.each(['ENTREGADO', 'REEMBOLSADO', 'ANULADO'])('una orden %s ya no admite renglones', async (estado) => {
    elInsertDevuelve([]);
    despuesLaBaseDevuelve([], [{ ...FILA_ORDEN, estado }]);

    expect(await ordenItems.crear(NUEVO, SIN_RESTRICCION)).toMatchObject({ tipo: 'orden-cerrada' });
  });

  it('si un renglón de INGRESO se pasa del total, dice cuánto queda por repartir', async () => {
    elInsertDevuelve([]);
    despuesLaBaseDevuelve([], [FILA_ORDEN], [{ disponible: '5.00' }]);

    expect(await ordenItems.crear(NUEVO, SIN_RESTRICCION)).toMatchObject({
      tipo: 'total-excedido',
      disponible: '5.00',
      orden: { numeroBoleta: '001234' },
    });
  });

  it('un cargo abierto que no se insertó no tiene un motivo conocido: falla en voz alta', async () => {
    elInsertDevuelve([]);
    despuesLaBaseDevuelve([], [FILA_ORDEN]);

    await expect(ordenItems.crear({ ...NUEVO, momento: 'ENTREGA' }, SIN_RESTRICCION)).rejects.toThrow(
      /no se insertó/,
    );
  });
});
