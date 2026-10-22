import { describe, expect, it } from 'vitest';
import { atajosDeFecha, sumarDias } from './atajosDeFecha';

describe('Atajos de fecha de la ropa — SPEC-KRILINXI-048', () => {
  it('da mañana, en 3 días y en una semana, con sus palabras', () => {
    expect(atajosDeFecha('2026-10-21')).toEqual([
      { texto: 'Mañana', fecha: '2026-10-22' },
      { texto: 'En 3 días', fecha: '2026-10-24' },
      { texto: 'En una semana', fecha: '2026-10-28' },
    ]);
  });

  it('cruza el fin de mes', () => {
    expect(atajosDeFecha('2026-10-30').map((a) => a.fecha)).toEqual(['2026-10-31', '2026-11-02', '2026-11-06']);
  });

  it('cruza el fin de año', () => {
    expect(atajosDeFecha('2026-12-30').map((a) => a.fecha)).toEqual(['2026-12-31', '2027-01-02', '2027-01-06']);
  });

  it('respeta el 29 de febrero de un año bisiesto, y su ausencia en uno común', () => {
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01');
  });
});
