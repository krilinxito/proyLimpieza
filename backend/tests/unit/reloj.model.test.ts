import { describe, expect, it, vi } from 'vitest';

// El doble es el POOL: lo que importa es DE DÓNDE sale la hora. Que coincida con
// la de la base de verdad está en tests/db/horaDelServidor.db.test.ts.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const reloj = await import('../../src/models/reloj.model.js');

describe('Reloj model — SPEC-ALE186-015', () => {
  it('le pregunta la hora a Postgres y la devuelve en ISO UTC', async () => {
    query.mockResolvedValueOnce({ rows: [{ ahora: new Date('2026-10-08T14:05:03.123Z') }] });

    expect(await reloj.ahora()).toBe('2026-10-08T14:05:03.123Z');
    expect(query).toHaveBeenCalledWith('SELECT now() AS ahora');
  });
});
