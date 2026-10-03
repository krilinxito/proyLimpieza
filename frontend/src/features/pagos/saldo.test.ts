import { describe, expect, it } from 'vitest';
import { calcularSaldo } from './saldo';

describe('Saldo de una orden — SPEC-KRILINXI-006', () => {
  it('sin entrega ni pagos, debe el precio total', () => {
    expect(calcularSaldo({ precioTotal: 5000, precioFinal: null, pagos: [] })).toBe(5000);
  });

  it('resta todos los pagos del precio total', () => {
    expect(calcularSaldo({ precioTotal: 5000, precioFinal: null, pagos: [2000, 1050] })).toBe(1950);
  });

  it('con entrega, manda el precio final aunque sea distinto del total (recargo por almacenamiento)', () => {
    expect(calcularSaldo({ precioTotal: 5000, precioFinal: 6000, pagos: [2000] })).toBe(4000);
  });

  it('un precio final de cero también cuenta: no cae al precio total', () => {
    expect(calcularSaldo({ precioTotal: 5000, precioFinal: 0, pagos: [] })).toBe(0);
  });

  it('cobrado de más da negativo: un saldo a favor del cliente', () => {
    expect(calcularSaldo({ precioTotal: 5000, precioFinal: null, pagos: [6000] })).toBe(-1000);
  });

  it('es exacto con centavos que en float no cuadran (0,10 + 0,20)', () => {
    expect(calcularSaldo({ precioTotal: 30, precioFinal: null, pagos: [10, 20] })).toBe(0);
  });
});
