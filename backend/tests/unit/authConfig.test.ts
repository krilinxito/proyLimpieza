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

describe('Dos plazos: el token de PowerSync dura menos de 24 h — SPEC-ALE186-025', () => {
  const BASE = { PS_JWT_SECRET_B64: SECRETO, PS_JWT_AUDIENCE: 'lavanderia' };

  it('sin PS_JWT_EXPIRES_IN, el de PowerSync dura 12 h, y el de la API sigue con sus 3 días', () => {
    const cfg = readAuthConfig(BASE);

    expect(cfg.expiraEnPowerSync).toBe('12h');
    expect(cfg.expiraEn).toBe('3d');
  });

  it.each(['6h', '30m', '24h'])('acepta PS_JWT_EXPIRES_IN=%s, que no pasa de 24 h', (plazo) => {
    expect(readAuthConfig({ ...BASE, PS_JWT_EXPIRES_IN: plazo }).expiraEnPowerSync).toBe(plazo);
  });

  it.each(['25h', '2d', '3d'])('rechaza PS_JWT_EXPIRES_IN=%s, diciendo que PowerSync no acepta más de 24 h', (plazo) => {
    expect(() => readAuthConfig({ ...BASE, PS_JWT_EXPIRES_IN: plazo })).toThrow(/PS_JWT_EXPIRES_IN/);
    expect(() => readAuthConfig({ ...BASE, PS_JWT_EXPIRES_IN: plazo })).toThrow(/24 horas/);
  });

  it.each(['cualquier cosa', '-1h'])('rechaza un plazo que no sirve: %j', (plazo) => {
    expect(() => readAuthConfig({ ...BASE, PS_JWT_EXPIRES_IN: plazo })).toThrow(/PS_JWT_EXPIRES_IN/);
  });

  it('un JWT_EXPIRES_IN de días no afecta al de PowerSync', () => {
    const cfg = readAuthConfig({ ...BASE, JWT_EXPIRES_IN: '7d' });

    expect(cfg.expiraEn).toBe('7d');
    expect(cfg.expiraEnPowerSync).toBe('12h');
  });
});
