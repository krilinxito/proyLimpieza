import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unicidadViolada } from '../helpers/postgres.js';

// El doble es el POOL, no el model: se prueba qué SQL arma el model, con qué
// parámetros y qué devuelve, igual que en `clientes.model.test.ts`. Que ese SQL
// funcione contra Postgres de verdad lo cubre `tests/db/usuarios.db.test.ts`.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const usuarios = await import('../../src/models/usuarios.model.js');

const ADMIN = '33333333-3333-3333-3333-333333333333';
const SUCURSAL = '22222222-2222-2222-2222-222222222222';

const FILA = {
  id: '55555555-5555-5555-5555-555555555555',
  nombre_completo: 'Rosa Mamani',
  username: 'rosa',
  rol: 'EMPLEADO',
  sucursal_id: SUCURSAL,
  telefono: '70011122',
  activo: true,
};

// Valores que delatarían una concatenación si aparecieran dentro del SQL: el
// username es la inyección de manual, el resto son marcas fáciles de buscar.
const NUEVO = {
  id: FILA.id,
  nombreCompleto: 'Nombre-Marca',
  username: "' OR 1=1 --",
  passwordHash: '$2b$10$hash-marca',
  rol: 'EMPLEADO' as const,
  sucursalId: SUCURSAL,
  telefono: '70011122',
  creadoPor: ADMIN,
};

/** Todo el SQL que se mandó al pool, sin los parámetros. */
function sqlEnviado(): string[] {
  return query.mock.calls.map((llamada) => String(llamada[0]));
}

describe('Usuarios model: alta — SPEC-ALE186-009', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('inserta con el id del cliente, anota quién lo creó y traduce la fila a camelCase', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    const { usuario, creado } = await usuarios.registrar(NUEVO);

    expect(creado).toBe(true);
    expect(usuario).toEqual({
      id: FILA.id,
      nombreCompleto: 'Rosa Mamani',
      username: 'rosa',
      rol: 'EMPLEADO',
      sucursalId: SUCURSAL,
      telefono: '70011122',
      activo: true,
    });

    const [sql, valores] = query.mock.calls[0] ?? [];
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(valores).toEqual([
      NUEVO.id,
      NUEVO.nombreCompleto,
      NUEVO.username,
      NUEVO.passwordHash,
      'EMPLEADO',
      SUCURSAL,
      '70011122',
      ADMIN,
    ]);
  });

  it('en un reintento devuelve la cuenta que ya estaba, sin insertar otra', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [FILA] });

    const { usuario, creado } = await usuarios.registrar(NUEVO);

    expect(creado).toBe(false);
    expect(usuario.id).toBe(FILA.id);
    expect(sqlEnviado()[1]).toMatch(/^SELECT/);
  });

  it('convierte la unicidad del username en un error de dominio', async () => {
    query.mockRejectedValueOnce(unicidadViolada('usuarios_username_key'));

    await expect(usuarios.registrar(NUEVO)).rejects.toBeInstanceOf(usuarios.UsernameOcupadoError);
  });

  it('deja pasar cualquier otro error de la base tal cual', async () => {
    const otro = unicidadViolada('usuarios_pkey');
    query.mockRejectedValueOnce(otro);

    await expect(usuarios.registrar(NUEVO)).rejects.toBe(otro);
  });
});

describe('Usuarios model: edición — SPEC-ALE186-009', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('actualiza solo los campos que vinieron, con las columnas de la lista cerrada', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...FILA, activo: false }] });

    const usuario = await usuarios.actualizar(FILA.id, { activo: false, telefono: null });

    expect(usuario?.activo).toBe(false);
    const [sql, valores] = query.mock.calls[0] ?? [];
    expect(sql).toMatch(/^UPDATE usuarios SET telefono = \$2, activo = \$3 WHERE id = \$1/);
    expect(valores).toEqual([FILA.id, null, false]);
  });

  it('sin cambios no escribe: devuelve la cuenta como está', async () => {
    query.mockResolvedValueOnce({ rows: [FILA] });

    await usuarios.actualizar(FILA.id, {});

    expect(sqlEnviado()).toHaveLength(1);
    expect(sqlEnviado()[0]).toMatch(/^SELECT/);
  });

  it('devuelve null cuando la cuenta no existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    expect(await usuarios.actualizar(FILA.id, { nombreCompleto: 'Otra' })).toBeNull();
  });
});

describe('Usuarios model: el hash no se escapa — SPEC-ALE186-009', () => {
  beforeEach(() => {
    query.mockReset();
    // Una fila con hash, como la devolvería un SELECT descuidado: si alguna
    // función lo pasara para afuera, aparecería en lo que devuelve.
    query.mockResolvedValue({ rows: [{ ...FILA, password_hash: '$2b$10$no-deberia-salir' }] });
  });

  // Todas las funciones del model menos `buscarPorUsername`, que es la del login.
  const SIN_HASH: [string, () => Promise<unknown>][] = [
    ['buscarPorId', () => usuarios.buscarPorId(FILA.id)],
    ['crear', () => usuarios.crear({ ...NUEVO, sucursalId: SUCURSAL })],
    ['registrar', () => usuarios.registrar(NUEVO)],
    ['actualizar', () => usuarios.actualizar(FILA.id, { passwordHash: NUEVO.passwordHash, nombreCompleto: 'X' })],
  ];

  it.each(SIN_HASH)('%s no pide password_hash ni lo devuelve', async (_nombre, llamar) => {
    const resultado = await llamar();

    // Se miran solo las columnas que se LEEN: la lista del SELECT y la del
    // RETURNING. El INSERT y el SET sí nombran la columna, porque la escriben.
    for (const sql of sqlEnviado()) {
      const leidas = [/^SELECT (.*?) FROM/s.exec(sql)?.[1], /RETURNING (.*)$/s.exec(sql)?.[1]];
      for (const columnas of leidas) expect(columnas ?? '').not.toContain('password_hash');
    }
    expect(JSON.stringify(resultado)).not.toContain('no-deberia-salir');
  });

  it('buscarPorUsername es la única que trae el hash', async () => {
    const usuario = await usuarios.buscarPorUsername('rosa');

    expect(usuario?.passwordHash).toBe('$2b$10$no-deberia-salir');
  });

  it.each([...SIN_HASH, ['buscarPorUsername', () => usuarios.buscarPorUsername(NUEVO.username)]] as const)(
    '%s pasa los valores como parámetros, nunca dentro del SQL',
    async (_nombre, llamar) => {
      await llamar();

      for (const sql of sqlEnviado()) {
        expect(sql).not.toContain(NUEVO.username);
        expect(sql).not.toContain(NUEVO.nombreCompleto);
        expect(sql).not.toContain(NUEVO.passwordHash);
        expect(sql).not.toContain(FILA.id);
      }
    },
  );
});
