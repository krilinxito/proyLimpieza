import { describe, expect, it } from 'vitest';
import { readAuthConfig } from '../../src/config.js';

// Un secreto de mentira pero con la forma correcta: 32 bytes en base64url.
const SECRETO = 'c2VjcmV0by1kZS1wcnVlYmEtZGUtbGEtc3VpdGUtMzI';

describe('readAuthConfig — SPEC-ALE186-002', () => {
  it('decodifica el secreto de base64url a bytes', () => {
    const cfg = readAuthConfig({ PS_JWT_SECRET_B64: SECRETO, PS_JWT_AUDIENCE: 'lavanderia' });

    // Lo importante no es el contenido sino que sean BYTES: es con lo que
    // firma el backend y con lo que PowerSync verifica.
    expect(Buffer.isBuffer(cfg.secreto)).toBe(true);
    expect(cfg.secreto).toHaveLength(32);
  });

  it('falla con instrucciones si falta el secreto', () => {
    expect(() => readAuthConfig({ PS_JWT_AUDIENCE: 'lavanderia' })).toThrow(/PS_JWT_SECRET_B64/);
    expect(() => readAuthConfig({ PS_JWT_AUDIENCE: 'lavanderia' })).toThrow(/openssl rand/);
  });

  it('rechaza el texto de ejemplo del .env.example por ser demasiado corto', () => {
    // Este es el valor que trae .env.example. Que arranque con él sería peor
    // que no arrancar: quedaría un sistema firmando con un secreto público.
    expect(() =>
      readAuthConfig({
        PS_JWT_SECRET_B64: 'reemplazame_con_un_secreto_generado',
        PS_JWT_AUDIENCE: 'lavanderia',
      }),
    ).toThrow(/al menos 32/);
  });

  it('exige la audiencia y explica que tiene que coincidir con PowerSync', () => {
    expect(() => readAuthConfig({ PS_JWT_SECRET_B64: SECRETO })).toThrow(/PS_JWT_AUDIENCE/);
    expect(() => readAuthConfig({ PS_JWT_SECRET_B64: SECRETO })).toThrow(/powersync\.yaml/);
  });

  it('usa 3 días cuando JWT_EXPIRES_IN no está definido', () => {
    // El plazo es el presupuesto de trabajo sin internet (CLAUDE.md sección 6),
    // no una medida de seguridad.
    const cfg = readAuthConfig({ PS_JWT_SECRET_B64: SECRETO, PS_JWT_AUDIENCE: 'lavanderia' });

    expect(cfg.expiraEn).toBe('3d');
  });

  it('respeta el JWT_EXPIRES_IN del entorno', () => {
    const cfg = readAuthConfig({
      PS_JWT_SECRET_B64: SECRETO,
      PS_JWT_AUDIENCE: 'lavanderia',
      JWT_EXPIRES_IN: '12h',
    });

    expect(cfg.expiraEn).toBe('12h');
  });
});
