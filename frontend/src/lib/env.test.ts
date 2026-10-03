import { describe, expect, it } from 'vitest';
import { leerEntorno } from './env';

const COMPLETO = { VITE_API_URL: 'http://localhost:4000', VITE_POWERSYNC_URL: 'http://localhost:8080' };

describe('Entorno — SPEC-KRILINXI-001', () => {
  it('devuelve la dirección de la API cuando la variable está definida', () => {
    expect(leerEntorno(COMPLETO).apiUrl).toBe('http://localhost:4000');
  });

  it('quita la barra final para que las rutas no queden con doble barra', () => {
    expect(leerEntorno({ ...COMPLETO, VITE_API_URL: 'http://localhost:4000/' }).apiUrl).toBe(
      'http://localhost:4000',
    );
  });

  it('falla con un mensaje en español cuando la variable no está', () => {
    expect(() => leerEntorno({ VITE_POWERSYNC_URL: COMPLETO.VITE_POWERSYNC_URL })).toThrowError(
      /falta configurar la dirección del servidor/i,
    );
  });

  it('trata una variable vacía o con espacios como si no estuviera', () => {
    expect(() => leerEntorno({ ...COMPLETO, VITE_API_URL: '   ' })).toThrowError(/\.env/);
  });
});

describe('Entorno: servicio de sincronización — SPEC-KRILINXI-004', () => {
  it('lee la dirección de PowerSync de VITE_POWERSYNC_URL, sin barra final', () => {
    expect(leerEntorno({ ...COMPLETO, VITE_POWERSYNC_URL: 'http://localhost:8080/' }).powersyncUrl).toBe(
      'http://localhost:8080',
    );
  });

  it('falla con un mensaje en español que dice qué hacer cuando la variable falta', () => {
    const sinPowersync = () => leerEntorno({ VITE_API_URL: COMPLETO.VITE_API_URL });
    expect(sinPowersync).toThrowError(/falta configurar la dirección del servicio de sincronización/);
    expect(sinPowersync).toThrowError(/\.env\.example/);
  });
});
