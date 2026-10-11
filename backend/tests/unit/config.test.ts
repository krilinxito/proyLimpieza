import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config.js';

// `readConfig` recibe el entorno como argumento justamente para esto: se le
// pasa un objeto de mentira y se comprueba qué hace, sin tocar process.env
// ni arrancar el servidor.
describe('config — SPEC-ALE186-001', () => {
  it('lee DATABASE_URL del entorno', () => {
    const config = readConfig({ DATABASE_URL: 'postgresql://u:p@localhost:5432/lavanderia' });

    expect(config.databaseUrl).toBe('postgresql://u:p@localhost:5432/lavanderia');
  });

  it('falla con un mensaje que dice qué hacer si falta DATABASE_URL', () => {
    expect(() => readConfig({})).toThrow(/DATABASE_URL/);
    expect(() => readConfig({})).toThrow(/\.env\.example/);
  });

  it('trata una DATABASE_URL vacía o en blanco como si no estuviera', () => {
    expect(() => readConfig({ DATABASE_URL: '   ' })).toThrow(/DATABASE_URL/);
  });

  it('usa el puerto 4000 cuando PORT no está definido', () => {
    expect(readConfig({ DATABASE_URL: 'postgresql://x' }).port).toBe(4000);
  });

  it('respeta el PORT del entorno, que es lo que permite esquivar un puerto ocupado', () => {
    expect(readConfig({ DATABASE_URL: 'postgresql://x', PORT: '4100' }).port).toBe(4100);
  });

  it('rechaza un PORT que no es un puerto', () => {
    expect(() => readConfig({ DATABASE_URL: 'postgresql://x', PORT: 'cuatro mil' })).toThrow(/PORT/);
    expect(() => readConfig({ DATABASE_URL: 'postgresql://x', PORT: '99999' })).toThrow(/PORT/);
  });
});

describe('config: CORS y tiempos límite de la base — SPEC-ALE186-023', () => {
  const BASE = { DATABASE_URL: 'postgresql://x' };

  it('lee CORS_ORIGENES como lista separada por comas, sin espacios ni entradas vacías', () => {
    const config = readConfig({ ...BASE, CORS_ORIGENES: ' https://a.bo , https://b.bo,, ' });

    expect(config.corsOrigenes).toEqual(['https://a.bo', 'https://b.bo']);
  });

  it.each([undefined, 'development', 'test'])(
    'sin CORS_ORIGENES y con NODE_ENV=%j, permite el frontend de desarrollo',
    (nodeEnv) => {
      expect(readConfig({ ...BASE, NODE_ENV: nodeEnv }).corsOrigenes).toEqual(['http://localhost:5173']);
    },
  );

  it('en producción, sin CORS_ORIGENES no arranca, y el mensaje dice qué variable agregar', () => {
    expect(() => readConfig({ ...BASE, NODE_ENV: 'production' })).toThrow(/CORS_ORIGENES/);
    // Vacía o solo comas cuenta como que falta.
    expect(() => readConfig({ ...BASE, NODE_ENV: 'production', CORS_ORIGENES: ' , ' })).toThrow(/CORS_ORIGENES/);
  });

  it('en producción, con CORS_ORIGENES, arranca con esa lista', () => {
    const config = readConfig({ ...BASE, NODE_ENV: 'production', CORS_ORIGENES: 'https://lavanderia.bo' });

    expect(config.corsOrigenes).toEqual(['https://lavanderia.bo']);
  });

  it('los tiempos límite de la base valen 10000 y 5000 ms si no se dicen', () => {
    const config = readConfig(BASE);

    expect(config.dbStatementTimeoutMs).toBe(10_000);
    expect(config.dbConnectionTimeoutMs).toBe(5_000);
  });

  it('respeta los tiempos límite del entorno', () => {
    const config = readConfig({ ...BASE, DB_STATEMENT_TIMEOUT_MS: '2500', DB_CONNECTION_TIMEOUT_MS: '800' });

    expect(config.dbStatementTimeoutMs).toBe(2500);
    expect(config.dbConnectionTimeoutMs).toBe(800);
  });

  it.each(['0', '-5', 'diez', '1.5'])('rechaza un tiempo límite de "%s", diciendo qué variable es', (valor) => {
    expect(() => readConfig({ ...BASE, DB_STATEMENT_TIMEOUT_MS: valor })).toThrow(/DB_STATEMENT_TIMEOUT_MS/);
  });
});
