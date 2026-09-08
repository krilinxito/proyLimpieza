import { describe, expect, it } from 'vitest';
import { leerEntorno } from './env';

describe('Entorno — SPEC-KRILINXI-001', () => {
  it('devuelve la dirección de la API cuando la variable está definida', () => {
    expect(leerEntorno({ VITE_API_URL: 'http://localhost:4000' })).toEqual({
      apiUrl: 'http://localhost:4000',
    });
  });

  it('quita la barra final para que las rutas no queden con doble barra', () => {
    expect(leerEntorno({ VITE_API_URL: 'http://localhost:4000/' }).apiUrl).toBe(
      'http://localhost:4000',
    );
  });

  it('falla con un mensaje en español cuando la variable no está', () => {
    expect(() => leerEntorno({})).toThrowError(/falta configurar la dirección del servidor/i);
  });

  it('trata una variable vacía o con espacios como si no estuviera', () => {
    expect(() => leerEntorno({ VITE_API_URL: '   ' })).toThrowError(/\.env/);
  });
});
