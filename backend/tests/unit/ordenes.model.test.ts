import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDS } from '../helpers/ordenes.js';
import { claveForaneaViolada, unicidadViolada } from '../helpers/postgres.js';

// El doble es el POOL, no el model: se prueba qué SQL arma el model, con qué
// parámetros, y cómo traduce los errores de Postgres (igual que en clientes).
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const ordenes = await import('../../src/models/ordenes.model.js');

const FILA = {
  id: IDS.orden,
  numero_boleta: '001234',
  cliente_id: IDS.cliente,
  sucursal_id: IDS.sucursal,
  usuario_recepcion_id: IDS.usuario,
  descripcion: '2 camisas, 1 terno',
  fecha_entrada: '2026-09-30 10:15:00',
  fecha_estimada_salida: '2026-10-03',
  precio_total: '45.50',
  estado: 'RECIBIDO',
};

const NUEVA = {
  id: IDS.orden,
  numeroBoleta: '001234',
  clienteId: IDS.cliente,
  sucursalId: IDS.sucursal,
  usuarioRecepcionId: IDS.usuario,
  descripcion: '2 camisas, 1 terno',
  precioTotal: 4550,
  fechaEstimadaSalida: '2026-10-03',
  fechaEntrada: '2026-09-30T14:15:00Z',
};

const ABIERTOS = ['RECIBIDO', 'EN_PROCESO', 'LISTO'] as const;

// Quien edita la orden: va a la auditoría (SPEC-ALE186-010).
const AUTOR = '11111111-1111-1111-1111-111111111111';

/** El SQL y los parámetros de la llamada número `n` al pool. */
function llamada(n = 0): [string, unknown[]] {
  const [sql, valores] = (query.mock.calls[n] ?? []) as [string, unknown[]];
  return [sql, valores];
}

beforeEach(() => {
  query.mockReset();
});

describe('Ordenes model: crear — SPEC-ALE186-004', () => {
  it('inserta con el id del dispositivo y traduce la fila a camelCase', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    const { orden, creada } = await ordenes.crear(NUEVA);

    expect(creada).toBe(true);
    expect(orden).toMatchObject({ id: IDS.orden, numeroBoleta: '001234', precioTotal: '45.50' });

    const [sql, valores] = llamada();
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(valores[0]).toBe(IDS.orden);
  });

  it('manda el precio como decimal exacto, nunca como float', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    await ordenes.crear(NUEVA);

    expect(llamada()[1]).toContain('45.50');
  });

  it('no escribe el estado: la orden nace RECIBIDO por el DEFAULT del schema', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    await ordenes.crear(NUEVA);

    const columnas = /INSERT INTO ordenes \(([^)]*)\)/.exec(llamada()[0])?.[1] ?? '';
    expect(columnas).not.toContain('estado');
  });

  it('pasa la fecha de entrada por timestamptz, y usa la hora del servidor si no viene', async () => {
    query.mockResolvedValue({ rows: [FILA] });

    await ordenes.crear(NUEVA);
    await ordenes.crear({ ...NUEVA, fechaEntrada: null });

    expect(llamada(0)[0]).toContain('COALESCE($9::timestamptz::timestamp, LOCALTIMESTAMP)');
    expect(llamada(0)[1][8]).toBe('2026-09-30T14:15:00Z');
    expect(llamada(1)[1][8]).toBeNull();
  });

  it('en un reintento devuelve la que ya estaba, sin insertar otra', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [FILA] });

    const { orden, creada } = await ordenes.crear(NUEVA);

    expect(creada).toBe(false);
    expect(orden.id).toBe(IDS.orden);
    expect(llamada(1)[0]).toMatch(/^SELECT/);
  });

  it('convierte la boleta repetida en la sucursal en un error de dominio', async () => {
    query.mockRejectedValueOnce(unicidadViolada('uq_boleta_por_sucursal'));

    await expect(ordenes.crear(NUEVA)).rejects.toBeInstanceOf(ordenes.BoletaOcupadaError);
  });

  it('convierte un cliente que no existe en un error de dominio', async () => {
    query.mockRejectedValueOnce(claveForaneaViolada('ordenes_cliente_id_fkey'));

    await expect(ordenes.crear(NUEVA)).rejects.toBeInstanceOf(ordenes.ClienteInexistenteError);
  });

  it('deja pasar sin tocar cualquier otro error de la base', async () => {
    const otro = unicidadViolada('ordenes_pkey');
    query.mockRejectedValueOnce(otro);

    await expect(ordenes.crear(NUEVA)).rejects.toBe(otro);
  });
});

describe('Ordenes model: actualizar — SPEC-ALE186-004', () => {
  const soloMiSucursal = { estadosDeOrigen: ABIERTOS, sucursalId: IDS.sucursal };

  it('pone las condiciones de estado y sucursal dentro de la misma sentencia que escribe', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...FILA, estado: 'LISTO' }] });

    const resultado = await ordenes.actualizar(IDS.orden, { estado: 'LISTO' }, soloMiSucursal, AUTOR);

    expect(resultado).toMatchObject({ tipo: 'actualizada', orden: { estado: 'LISTO' } });
    const [sql, valores] = llamada();
    expect(sql).toMatch(/UPDATE ordenes AS c SET estado = \$4/);
    // Las condiciones, en el SELECT … FOR UPDATE que lee la fila de antes.
    expect(sql).toMatch(/FROM ordenes WHERE id = \$1 AND estado = ANY[\s\S]*sucursal_id = \$3\) FOR UPDATE/);
    expect(valores).toEqual([IDS.orden, ABIERTOS, IDS.sucursal, 'LISTO', AUTOR, 'EDITAR', 'ordenes']);
    // Una sola consulta: no hay un SELECT previo que otra petición pueda adelantar.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('solo toca las columnas de la lista cerrada, y el precio va como decimal', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    await ordenes.actualizar(IDS.orden, { precioTotal: 6000, descripcion: 'Terno' }, soloMiSucursal, AUTOR);

    const [sql, valores] = llamada();
    expect(sql).toContain('descripcion = $4, precio_total = $5');
    expect(valores.slice(3, 5)).toEqual(['Terno', '60.00']);
  });

  it('sin cambios no escribe, pero devuelve la orden si es visible', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    const resultado = await ordenes.actualizar(IDS.orden, {}, soloMiSucursal, AUTOR);

    expect(resultado.tipo).toBe('actualizada');
    expect(llamada()[0]).toMatch(/^SELECT/);
  });

  it('distingue una orden cuyo estado no admite el cambio', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...FILA, estado: 'ANULADO' }] });

    const resultado = await ordenes.actualizar(IDS.orden, { estado: 'LISTO' }, soloMiSucursal, AUTOR);

    expect(resultado).toMatchObject({ tipo: 'estado-no-admitido', orden: { estado: 'ANULADO' } });
  });

  it('una orden de otra sucursal no se encuentra, aunque exista', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...FILA, sucursal_id: IDS.otraSucursal }] });

    const resultado = await ordenes.actualizar(IDS.orden, { estado: 'LISTO' }, soloMiSucursal, AUTOR);

    expect(resultado).toEqual({ tipo: 'no-encontrada' });
  });

  it('sin restricción de sucursal (el ADMIN), la de otra sucursal sí se encuentra', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...FILA, sucursal_id: IDS.otraSucursal, estado: 'ANULADO' }] });

    const resultado = await ordenes.actualizar(
      IDS.orden,
      { estado: 'LISTO' },
      { estadosDeOrigen: ABIERTOS, sucursalId: null },
      AUTOR,
    );

    expect(resultado.tipo).toBe('estado-no-admitido');
    expect(llamada()[1][2]).toBeNull();
  });

  it('una orden que no existe no se encuentra', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const resultado = await ordenes.actualizar(IDS.orden, { estado: 'LISTO' }, soloMiSucursal, AUTOR);

    expect(resultado).toEqual({ tipo: 'no-encontrada' });
  });

  it('convierte la boleta repetida en un error de dominio también al editar', async () => {
    query.mockRejectedValueOnce(unicidadViolada('uq_boleta_por_sucursal'));

    await expect(
      ordenes.actualizar(IDS.orden, { numeroBoleta: '009999' }, soloMiSucursal, AUTOR),
    ).rejects.toBeInstanceOf(ordenes.BoletaOcupadaError);
  });
});

describe('Ordenes model: sucursal cerrada y fecha futura — SPEC-ALE186-014', () => {
  it('las dos reglas van dentro del INSERT, con la fecha, la sucursal y el margen como parámetros', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    await ordenes.crear(NUEVA);

    const [sql, valores] = llamada();
    expect(sql).toMatch(/INSERT INTO ordenes[\s\S]*SELECT[\s\S]*FROM sucursales s\s+WHERE s\.id = \$4::uuid/);
    expect(sql).toContain('$9::timestamptz <= now() + $10::interval');
    // La sucursal abierta, o la fecha de entrada antes de su cierre. Desde
    // SPEC-ALE186-020 el cierre es la columna `cerrada_en`, no una búsqueda en la auditoría.
    expect(sql).toMatch(/s\.activa\s+OR \(\$9::timestamptz IS NOT NULL\s+AND \$9::timestamptz::timestamp < s\.cerrada_en\)/);
    expect(sql).not.toContain('FROM auditoria cierre');
    expect(valores.slice(8, 10)).toEqual([NUEVA.fechaEntrada, '5 minutes']);
    expect(sql).not.toContain(NUEVA.fechaEntrada);
  });

  it('si no insertó, el reintento gana: devuelve la orden aunque la sucursal esté cerrada', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [FILA] });

    expect(await ordenes.crear(NUEVA)).toMatchObject({ creada: false, orden: { id: IDS.orden } });
  });

  it.each([
    ['la fecha está en el futuro', { futura: true, activa: true }, 'FechaFuturaError'],
    ['la sucursal está cerrada', { futura: false, activa: false }, 'SucursalCerradaError'],
  ])('si no insertó y no es un reintento, dice que %s', async (_caso, motivo, error) => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [motivo] });

    await expect(ordenes.crear(NUEVA)).rejects.toMatchObject({ name: error });
  });
});
