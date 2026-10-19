import { describe, expect, it } from 'vitest';
import { diaEnBolivia, hoyEnBolivia, instanteGuardado } from './diaDelNegocio';

describe('El día del negocio — SPEC-KRILINXI-035', () => {
  it('un cobro de las 21:00 en Bolivia es de ese día, aunque en UTC ya sea el siguiente', () => {
    // 21:00 en La Paz (UTC-4) son las 01:00 del día siguiente en UTC.
    expect(diaEnBolivia(Date.UTC(2026, 9, 19, 1, 0))).toBe('2026-10-18');
    expect(hoyEnBolivia(Date.UTC(2026, 9, 19, 4, 0))).toBe('2026-10-19');
  });

  it.each([
    ['escrito en la tablet, con zona', '2026-10-19T01:00:00.000Z'],
    ['bajado del servidor, sin zona (UTC)', '2026-10-19 01:00:00'],
    ['bajado del servidor, con fracción', '2026-10-19 01:00:00.123'],
  ])('lee un instante %s', (_caso, texto) => {
    const ms = instanteGuardado(texto);
    expect(ms).not.toBeNull();
    expect(diaEnBolivia(ms ?? 0)).toBe('2026-10-18');
  });

  it('lo que no es una fecha da null, no un día inventado', () => {
    expect(instanteGuardado('ayer')).toBeNull();
  });
});
