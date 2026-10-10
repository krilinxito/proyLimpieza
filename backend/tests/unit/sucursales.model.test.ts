import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unicidadViolada } from '../helpers/postgres.js';

// El doble es el POOL, como en los demás tests de model: se prueba qué SQL arma,
// con qué parámetros, y cómo decide el motivo cuando no escribió. Que las reglas
// (nombre único, sin ropa abierta) frenen de verdad lo dice Postgres, en
// tests/db/sucursales.db.test.ts.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const sucursales = await import('../../src/models/sucursales.model.js');

const ID = '66666666-6666-6666-6666-666666666666';
const ADMIN = '33333333-3333-3333-3333-333333333333';
const FILA = { id: ID, nombre: 'Norte', direccion: null, telefono: null, activa: true };
// Un nombre que delataría una concatenación si apareciera dentro del SQL.
const INYECCION = "Norte'; DROP TABLE sucursales; --";

function llamada(n = 0): [string, unknown[]] {
  const [sql, valores] = (query.mock.calls[n] ?? []) as [string, unknown[]];
  return [sql, valores];
}

/** Respuestas del pool, en el orden en que el model las va a pedir. */
function laBaseDevuelve(...filas: unknown[][]) {
  for (const rows of filas) query.mockResolvedValueOnce({ rows });
}

beforeEach(() => {
  query.mockReset();
});

describe('Sucursales model: alta — SPEC-ALE186-011', () => {
  const NUEVA = { id: ID, nombre: INYECCION, direccion: null, telefono: '3-3334455' };

  // Desde SPEC-ALE186-020 el nombre único lo garantiza un índice de la base: el
  // INSERT ya no lleva la condición, y el model traduce el 23505 de ese índice.
  it('inserta con todo como parámetro, y deja la unicidad del nombre al índice de la base', async () => {
    laBaseDevuelve([FILA]);

    const { creada } = await sucursales.registrar(NUEVA, ADMIN);

    expect(creada).toBe(true);
    const [sql, valores] = llamada();
    expect(sql).toMatch(/INSERT INTO sucursales \(id, nombre, direccion, telefono\)\s+VALUES \(\$1, \$2, \$3, \$4\)/);
    expect(sql).not.toContain('otra.nombre');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).not.toContain('DROP TABLE');
    expect(valores).toEqual([ID, INYECCION, null, '3-3334455', ADMIN, 'CREAR', 'sucursales']);
  });

  it('en un reintento devuelve la que ya estaba, sin insertar otra', async () => {
    laBaseDevuelve([], [FILA]);

    const { sucursal, creada } = await sucursales.registrar(NUEVA, ADMIN);

    expect(creada).toBe(false);
    expect(sucursal.id).toBe(ID);
  });

  it('si no insertó y el id no existe, es que el nombre lo tiene otra', async () => {
    laBaseDevuelve([], []);

    await expect(sucursales.registrar(NUEVA, ADMIN)).rejects.toBeInstanceOf(sucursales.NombreOcupadoError);
  });
});

describe('Sucursales model: edición — SPEC-ALE186-011', () => {
  it('actualiza solo lo que vino, y sin cerrar no pide los estados de las órdenes', async () => {
    laBaseDevuelve([{ ...FILA, telefono: '3-1' }]);

    const resultado = await sucursales.actualizar(ID, { telefono: '3-1' }, ADMIN);

    expect(resultado).toMatchObject({ tipo: 'actualizada', sucursal: { telefono: '3-1' } });
    const [sql, valores] = llamada();
    expect(sql).toMatch(/UPDATE sucursales AS c SET telefono = \$2/);
    // Un parámetro que no aparece en el SQL hace fallar a Postgres: los estados
    // solo viajan cuando se está cerrando.
    expect(sql).not.toContain('estado_orden');
    expect(valores).toEqual([ID, '3-1', ADMIN, 'EDITAR', 'sucursales']);
  });

  it('al cerrar, exige en la misma sentencia que no quede ropa abierta', async () => {
    laBaseDevuelve([{ ...FILA, activa: false }]);

    await sucursales.actualizar(ID, { activa: false }, ADMIN);

    const [sql, valores] = llamada();
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM ordenes[\s\S]*ordenes\.estado = ANY\(\$2::estado_orden\[\]\)\)[\s\S]*FOR UPDATE/);
    expect(sql).toContain('activa = $3');
    expect(valores.slice(0, 3)).toEqual([ID, ['RECIBIDO', 'EN_PROCESO', 'LISTO'], false]);
  });

  it('al reabrir no mira las órdenes', async () => {
    laBaseDevuelve([FILA]);

    await sucursales.actualizar(ID, { activa: true }, ADMIN);

    expect(llamada()[0]).not.toContain('FROM ordenes');
  });

  it('al renombrar, el nombre nuevo va como parámetro', async () => {
    laBaseDevuelve([FILA]);

    await sucursales.actualizar(ID, { nombre: INYECCION }, ADMIN);

    const [sql, valores] = llamada();
    expect(sql).toContain('nombre = $2');
    expect(sql).not.toContain('DROP TABLE');
    expect(valores[1]).toBe(INYECCION);
  });

  it('sin cambios no escribe: devuelve la sucursal como está', async () => {
    laBaseDevuelve([FILA]);

    expect(await sucursales.actualizar(ID, {}, ADMIN)).toEqual({ tipo: 'actualizada', sucursal: FILA });
    expect(llamada()[0]).toMatch(/^SELECT/);
  });

  it('si no escribió y no existe, no se encuentra', async () => {
    laBaseDevuelve([], []);

    expect(await sucursales.actualizar(ID, { activa: false }, ADMIN)).toEqual({ tipo: 'no-encontrada' });
  });

  it('si el índice rechaza el nombre, lo dice', async () => {
    query.mockRejectedValueOnce(unicidadViolada('uq_sucursales_nombre'));

    expect(await sucursales.actualizar(ID, { nombre: 'Central', activa: false }, ADMIN)).toEqual({
      tipo: 'nombre-ocupado',
    });
  });

  it('si no escribió por la ropa abierta, dice cuántas órdenes quedan', async () => {
    laBaseDevuelve([], [FILA], [{ cantidad: 4 }]);

    expect(await sucursales.actualizar(ID, { activa: false }, ADMIN)).toEqual({
      tipo: 'con-ropa-abierta',
      cantidad: 4,
    });
    expect(llamada(2)[1]).toEqual([ID, ['RECIBIDO', 'EN_PROCESO', 'LISTO']]);
  });
});
