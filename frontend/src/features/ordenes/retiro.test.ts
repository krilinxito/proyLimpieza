import { describe, expect, it } from 'vitest';
import { textoDelRetiro } from './retiro';

describe('Retiro: cómo se dice quién se llevó la ropa — SPEC-KRILINXI-060', () => {
  it('sin boleta dice el nombre y el carnet', () => {
    expect(textoDelRetiro({ tipo: 'SIN_BOLETA', nombre: 'Luis Mamani', carnet: '1234567 LP' })).toBe(
      'Luis Mamani, 1234567 LP',
    );
  });

  it('con boleta no hay nombre que decir', () => {
    expect(textoDelRetiro({ tipo: 'CON_BOLETA', nombre: null, carnet: null })).toBe('Con la boleta');
  });

  it('un dato roto no deja la línea vacía', () => {
    expect(textoDelRetiro({ tipo: 'SIN_BOLETA', nombre: null, carnet: null })).toBe('Sin datos');
  });
});
