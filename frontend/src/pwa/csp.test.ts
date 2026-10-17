// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cspEnElBuild, directivas, politicaDeContenido } from './csp';

const SERVICIOS = { apiUrl: 'https://api.lavanderia.bo/api', powersyncUrl: 'https://sync.lavanderia.bo' };

describe('La política de seguridad del contenido — SPEC-KRILINXI-020', () => {
  it('solo deja hablar con el sitio, la API y PowerSync, por su origen', () => {
    expect(directivas(SERVICIOS)['connect-src']).toEqual(["'self'", 'https://api.lavanderia.bo', 'https://sync.lavanderia.bo']);
  });

  it('scripts, estilos, workers y WASM solo del propio sitio', () => {
    const d = directivas(SERVICIOS);
    for (const nombre of ['default-src', 'script-src', 'style-src', 'worker-src']) expect(d[nombre]).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
  });

  it('no permite nada en línea, ni eval, ni cualquier origen', () => {
    const politica = politicaDeContenido(SERVICIOS);
    expect(politica).not.toMatch(/'unsafe-inline'|'unsafe-eval'|(^|\s)\*(\s|;|$)|\bdata:|\bblob:|https?:(\s|;|$)/);
  });

  it('una dirección rota corta el build en vez de dejar la app sin política', () => {
    expect(() => politicaDeContenido({ ...SERVICIOS, apiUrl: 'no es una url' })).toThrow(/VITE_API_URL/);
  });

  it('el plugin solo corre al compilar, no en npm run dev', () => {
    expect(cspEnElBuild().apply).toBe('build');
  });
});
