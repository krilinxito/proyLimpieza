import { describe, expect, it } from 'vitest';
import { opcionesDelPool } from '../../src/db/pool.js';

// Que Postgres de verdad corte la consulta lenta lo prueba la base real
// (tests/db/seguridad.db.test.ts). Acá, que el pool reciba lo que dice la config.
describe('El pool con tiempos límite — SPEC-ALE186-023', () => {
  it('pasa el statement_timeout y el tiempo de conexión de la config', () => {
    const opciones = opcionesDelPool({
      databaseUrl: 'postgresql://x',
      dbStatementTimeoutMs: 1234,
      dbConnectionTimeoutMs: 567,
    });

    expect(opciones).toEqual({
      connectionString: 'postgresql://x',
      statement_timeout: 1234,
      connectionTimeoutMillis: 567,
    });
  });
});
