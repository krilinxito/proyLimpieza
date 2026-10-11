import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { config } from '../../src/config.js';
import { opcionesDelPool, pool } from '../../src/db/pool.js';

// Contra Postgres real (sección 4): que el pool PIDA un statement_timeout lo
// mira un test unitario; que Postgres de verdad CORTE la consulta, solo la base.
//
// Para no esperar 10 s, se arma un pool aparte con las mismas opciones del
// proyecto (`opcionesDelPool`) pero con un límite de 200 ms.
const conLimiteCorto = new pg.Pool(
  opcionesDelPool({
    databaseUrl: process.env.DATABASE_URL ?? '',
    dbStatementTimeoutMs: 200,
    dbConnectionTimeoutMs: 2000,
  }),
);

afterAll(async () => {
  await conLimiteCorto.end();
});

describe('Postgres corta la consulta que pasa del tiempo límite — SPEC-ALE186-023', () => {
  it('una consulta de 2 s con un límite de 200 ms falla con 57014, y mucho antes de los 2 s', async () => {
    const inicio = Date.now();

    const error = await conLimiteCorto.query('SELECT pg_sleep(2)').catch((causa: unknown) => causa);

    expect(error).toBeInstanceOf(pg.DatabaseError);
    // 57014 = query_canceled: "canceling statement due to statement timeout".
    expect((error as pg.DatabaseError).code).toBe('57014');
    expect(Date.now() - inicio).toBeLessThan(1500);
  });

  it('después del corte, la conexión vuelve al pool y sirve para la siguiente consulta', async () => {
    await conLimiteCorto.query('SELECT pg_sleep(2)').catch(() => undefined);

    const { rows } = await conLimiteCorto.query<{ uno: number }>('SELECT 1 AS uno');

    expect(rows[0]?.uno).toBe(1);
  });

  it('el pool de la aplicación conecta con el límite de la config', async () => {
    // `pg_settings.setting` lo da en milisegundos, la misma unidad que la config.
    const { rows } = await pool.query<{ setting: string }>(
      "SELECT setting FROM pg_settings WHERE name = 'statement_timeout'",
    );

    expect(Number(rows[0]?.setting)).toBe(config.dbStatementTimeoutMs);
  });
});
