import { afterEach, describe, expect, it, vi } from 'vitest';
import { COSTE_BCRYPT, HASH_SENUELO, costeBcrypt, hashearContrasena } from '../../src/utils/contrasenas.js';

// El costo de bcrypt se lee del propio hash: `$2b$10$…` es costo 10. Por eso
// estos tests no necesitan medir tiempos, que dependen de la máquina: miran el
// prefijo, que es exacto.
function costoDe(hash: string): number {
  return Number(hash.split('$')[2]);
}

afterEach(() => {
  vi.doUnmock('../../src/config.js');
  vi.resetModules();
});

describe('El costo de bcrypt según el entorno — SPEC-ALE186-022', () => {
  it.each(['production', 'development', undefined, '', 'Test', 'testing', ' test'])(
    'con NODE_ENV=%j usa el costo de producción, 10',
    (nodeEnv) => {
      expect(costeBcrypt(nodeEnv)).toBe(10);
    },
  );

  it('solo con NODE_ENV exactamente "test" baja a 4', () => {
    expect(costeBcrypt('test')).toBe(4);
  });

  it('bajo Vitest (NODE_ENV=test), los hashes nuevos y el señuelo salen con costo 4', async () => {
    expect(COSTE_BCRYPT).toBe(4);
    expect(costoDe(await hashearContrasena('una-clave'))).toBe(4);
    expect(costoDe(HASH_SENUELO)).toBe(4);
  });

  it('en producción, los hashes nuevos y el señuelo salen con costo 10', async () => {
    // El módulo arma su costo al cargarse, con la config del proceso. Para verlo
    // "en producción" se lo vuelve a cargar con una config de mentira.
    vi.resetModules();
    vi.doMock('../../src/config.js', () => ({ config: { nodeEnv: 'production' } }));
    const enProduccion = await import('../../src/utils/contrasenas.js');

    expect(enProduccion.COSTE_BCRYPT).toBe(10);
    expect(costoDe(await enProduccion.hashearContrasena('una-clave'))).toBe(10);
    expect(costoDe(enProduccion.HASH_SENUELO)).toBe(10);
  });
});
