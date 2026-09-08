import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config.js';

// `readConfig` recibe el entorno como argumento justamente para esto: se le
// pasa un objeto de mentira y se comprueba qué hace, sin tocar process.env
// ni arrancar el servidor.
describe('config — SPEC-001', () => {
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
