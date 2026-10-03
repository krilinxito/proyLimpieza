import { describe, expect, it } from 'vitest';
import { aDecimal, desdeDecimal, formatearBs, formatearMonto, parsearMonto, restar, sumar } from './money';

/**
 * Tests de tabla: `it.each` corre el mismo test una vez por fila. Para funciones puras como
 * estas es la forma más barata de cubrir muchos casos, y cada fila fallida sale con su
 * propio nombre en el reporte.
 */
describe('money: leer lo que escribe el empleado — SPEC-KRILINXI-002', () => {
  it.each([
    ['12,50', 1250],
    ['12.50', 1250],
    ['12,5', 1250],
    ['12', 1200],
    ['0,05', 5],
    ['  7,25  ', 725],
    ['0', 0],
  ])('"%s" son %i centavos', (texto, centavos) => {
    expect(parsearMonto(texto)).toBe(centavos);
  });

  it.each([
    ['más de dos decimales', '12,505'],
    ['letras', '12a'],
    ['texto', 'doce'],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['negativo', '-5'],
    ['dos separadores', '1.234,56'],
    ['separador sin decimales', '12,'],
  ])('rechaza un monto con %s', (_caso, texto) => {
    expect(() => parsearMonto(texto)).toThrow();
  });

  it('el error se puede mostrar tal cual en el mostrador', () => {
    expect(() => parsearMonto('doce')).toThrow('Por ejemplo: 12,50');
  });
});

describe('money: cuentas exactas — SPEC-KRILINXI-002', () => {
  it('sumar 10 y 20 centavos da exactamente 30, sin el error de 0.1 + 0.2', () => {
    // El contraejemplo, para que se vea por qué existe este módulo:
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumar(10, 20)).toBe(30);
  });

  it('suma cualquier cantidad de montos, y ninguno da cero', () => {
    expect(sumar(1250, 750, 5)).toBe(2005);
    expect(sumar()).toBe(0);
  });

  it('restar puede dar negativo: un saldo a favor', () => {
    expect(restar(1000, 1500)).toBe(-500);
  });
});

describe('money: mostrar en pantalla — SPEC-KRILINXI-002', () => {
  it.each([
    [1250, '12,50'],
    [123456, '1.234,56'],
    [5, '0,05'],
    [0, '0,00'],
    [100000000, '1.000.000,00'],
    [-500, '-5,00'],
  ])('%i centavos se muestran "%s"', (centavos, texto) => {
    expect(formatearMonto(centavos)).toBe(texto);
  });

  it('rechaza centavos con decimales: es la señal de que se coló un float', () => {
    expect(() => formatearMonto(12.5)).toThrow();
  });

  it('lo que se muestra se vuelve a leer igual', () => {
    expect(parsearMonto(formatearMonto(1250))).toBe(1250);
  });
});

describe('money: lo que guarda la base local — SPEC-KRILINXI-006', () => {
  // Los montos que pide el criterio, y los bordes: cero, centavos sueltos y el máximo de
  // NUMERIC(10,2). Ida y vuelta sin perder un centavo.
  it.each([
    [0, '0.00'],
    [10, '0.10'],
    [2550, '25.50'],
    [9_999_999_999, '99999999.99'],
  ])('%i centavos se guardan como "%s" y se leen igual', (centavos, texto) => {
    expect(aDecimal(centavos)).toBe(texto);
    expect(desdeDecimal(texto)).toBe(centavos);
  });

  it('lee también lo que Postgres podría mandar sin ceros a la derecha', () => {
    expect(desdeDecimal('25.5')).toBe(2550);
    expect(desdeDecimal('25')).toBe(2500);
  });

  it.each(['25,50', '-1.00', '1.234', '', 'abc'])('rechaza "%s": un dato guardado no se adivina', (texto) => {
    expect(() => desdeDecimal(texto)).toThrow();
  });

  it.each([-1, 0.5, Number.NaN])('no guarda %s: solo enteros de centavos no negativos', (centavos) => {
    expect(() => aDecimal(centavos)).toThrow();
  });
});

describe('money: en bolivianos — SPEC-KRILINXI-006', () => {
  it('pone el símbolo de la moneda delante del monto formateado', () => {
    expect(formatearBs(123456)).toBe('Bs 1.234,56');
    expect(formatearBs(0)).toBe('Bs 0,00');
  });
});
