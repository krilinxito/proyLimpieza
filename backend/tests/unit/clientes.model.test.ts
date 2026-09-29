import pg from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Acá el doble no es el model sino el POOL: lo que se prueba es el propio model
// —qué SQL arma, con qué parámetros, cómo traduce los errores de Postgres—, así
// que se le deja correr entero y solo se intercepta el momento de hablar con la
// base. Que ese SQL funcione contra un Postgres de verdad se comprueba aparte.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const clientes = await import('../../src/models/clientes.model.js');

const FILA = {
  id: '44444444-4444-4444-4444-444444444444',
  nombre: 'Ana Quispe',
  telefono: '70123456',
  carnet: null,
  fecha_registro: '2026-09-28 10:15:00',
  sucursal_registro_id: '22222222-2222-2222-2222-222222222222',
};

const NUEVO = {
  id: FILA.id,
  nombre: 'Ana Quispe',
  telefono: '70123456',
  carnet: null,
  sucursalRegistroId: FILA.sucursal_registro_id,
};

/** Un error como el que tira `pg` cuando se viola una restricción UNIQUE. */
function unicidadViolada(restriccion: string): pg.DatabaseError {
  const error = new pg.DatabaseError('duplicate key value violates unique constraint', 0, 'error');
  error.code = '23505';
  error.constraint = restriccion;
  return error;
}

describe('Clientes model — SPEC-ALE186-003', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('inserta con el id del dispositivo y traduce la fila a camelCase', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    const { cliente, creado } = await clientes.crear(NUEVO);

    expect(creado).toBe(true);
    expect(cliente).toMatchObject({ id: FILA.id, fechaRegistro: '2026-09-28 10:15:00' });

    const [sql, valores] = query.mock.calls[0] ?? [];
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(valores).toEqual([NUEVO.id, 'Ana Quispe', '70123456', null, NUEVO.sucursalRegistroId]);
  });

  it('en un reintento devuelve el que ya estaba, sin insertar otro', async () => {
    // ON CONFLICT DO NOTHING no devuelve filas: el INSERT no hizo nada.
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [FILA] });

    const { cliente, creado } = await clientes.crear(NUEVO);

    expect(creado).toBe(false);
    expect(cliente.id).toBe(FILA.id);
    expect(query.mock.calls[1]?.[0]).toMatch(/^SELECT/);
  });

  it('convierte la unicidad del teléfono en un error de dominio', async () => {
    query.mockRejectedValueOnce(unicidadViolada('clientes_telefono_key'));

    await expect(clientes.crear(NUEVO)).rejects.toBeInstanceOf(clientes.TelefonoOcupadoError);
  });

  it('deja pasar cualquier otro error de la base tal cual', async () => {
    // Otra restricción, otro problema: disfrazarlo de "teléfono repetido"
    // mandaría al empleado a buscar un cliente que no tiene nada que ver.
    const otro = unicidadViolada('alguna_otra_restriccion');
    query.mockRejectedValueOnce(otro);

    await expect(clientes.crear(NUEVO)).rejects.toBe(otro);
  });

  it('arma el UPDATE solo con los campos que llegaron, y los valores como parámetros', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...FILA, nombre: 'Ana María' }] });

    await clientes.actualizar(FILA.id, { nombre: "Ana'; DROP TABLE clientes; --" });

    const [sql, valores] = query.mock.calls[0] ?? [];
    expect(sql).toMatch(/SET nombre = \$2 WHERE id = \$1/);
    // El valor peligroso viaja como parámetro y NUNCA aparece dentro del SQL.
    expect(sql).not.toContain('DROP TABLE');
    expect(valores).toEqual([FILA.id, "Ana'; DROP TABLE clientes; --"]);
  });

  it('permite vaciar el carnet', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    await clientes.actualizar(FILA.id, { carnet: null });

    expect(query.mock.calls[0]?.[0]).toContain('SET carnet = $2');
    expect(query.mock.calls[0]?.[1]).toEqual([FILA.id, null]);
  });

  it('sin cambios no escribe: solo devuelve el cliente', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    await clientes.actualizar(FILA.id, {});

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toMatch(/^SELECT/);
  });

  it('devuelve null al actualizar un cliente que no existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    expect(await clientes.actualizar(FILA.id, { nombre: 'Ana' })).toBeNull();
  });
});
