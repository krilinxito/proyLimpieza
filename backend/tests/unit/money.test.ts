import { describe, expect, it } from 'vitest';
import { formatear, parse, restar, sumar } from '../../src/utils/money.js';

describe('money — SPEC-ALE186-001', () => {
  describe('parse', () => {
    it('convierte a centavos el string que devuelve pg para un NUMERIC(10,2)', () => {
      expect(parse('12.50')).toBe(1250);
      expect(parse('0.05')).toBe(5);
      expect(parse('100.00')).toBe(10000);
    });

    it('acepta montos sin decimales o con uno solo', () => {
      expect(parse('12')).toBe(1200);
      expect(parse('12.5')).toBe(1250);
    });

    it('soporta el máximo que cabe en NUMERIC(10,2) sin perder precisión', () => {
      expect(parse('99999999.99')).toBe(9999999999);
    });

    it('conserva el signo de un monto negativo', () => {
      expect(parse('-12.50')).toBe(-1250);
    });

    it('rechaza un valor contaminado por floats en vez de redondearlo en silencio', () => {
      // Este es el caso que justifica todo el helper: si alguien sumó con `+`
      // números de punto flotante, el resultado llega así y tiene que doler.
      expect(() => parse('0.30000000000000004')).toThrow(/no es un monto válido/);
    });

    it('rechaza texto que no es un monto', () => {
      expect(() => parse('doce con cincuenta')).toThrow();
      expect(() => parse('')).toThrow();
      expect(() => parse('1e3')).toThrow();
    });
  });

  describe('sumar y restar', () => {
    it('suma sin el error de punto flotante que tendría con decimales', () => {
      // Con floats esto daría 0.30000000000000004; con centavos, 30 exactos.
      expect(sumar(parse('0.10'), parse('0.20'))).toBe(30);
      expect(formatear(sumar(parse('0.10'), parse('0.20')))).toBe('0.30');
    });

    it('suma una lista de pagos', () => {
      const pagos = ['20.00', '15.50', '4.50'].map(parse);
      expect(formatear(sumar(...pagos))).toBe('40.00');
    });

    it('devuelve cero si no hay ningún monto', () => {
      expect(sumar()).toBe(0);
    });

    it('permite un saldo negativo, que es cuando se cobró de más', () => {
      // Saldo = precio - pagos. Si el cliente adelantó más de lo que costó,
      // el saldo queda a su favor y el sistema tiene que poder decirlo.
      expect(restar(parse('50.00'), parse('60.00'))).toBe(-1000);
    });
  });

  describe('formatear', () => {
    it('devuelve el string decimal que entiende Postgres', () => {
      expect(formatear(1250)).toBe('12.50');
      expect(formatear(5)).toBe('0.05');
      expect(formatear(0)).toBe('0.00');
      expect(formatear(-1250)).toBe('-12.50');
    });

    it('completa siempre los dos decimales', () => {
      expect(formatear(1200)).toBe('12.00');
      expect(formatear(1210)).toBe('12.10');
    });

    it('es la operación inversa de parse', () => {
      for (const monto of ['0.00', '0.05', '12.50', '99999999.99']) {
        expect(formatear(parse(monto))).toBe(monto);
      }
    });

    it('rechaza centavos que no son enteros', () => {
      expect(() => formatear(12.5)).toThrow(/entero/);
    });
  });
});
