import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esCarnetValido, esNumeroDeBoleta, esTelefonoValido } from '../../src/utils/formatos.js';

// Los casos son los de `context/formatos.casos.json`, los mismos que prueba el frontend (`lib/formatos.test.ts`): si las dos
// copias de la regla se separan, uno de los dos tests falla — SPEC-KRILINXI-058.
const CASOS = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../context/formatos.casos.json'), 'utf8')) as Record<
  'boleta' | 'telefono' | 'carnet',
  { valor: string; valido: boolean }[]
>;

describe('Formatos de boleta, teléfono y carnet — SPEC-KRILINXI-058', () => {
  it.each(CASOS.boleta.map((c) => [c.valor, c.valido] as const))('boleta %j → %s', (valor, valido) => {
    expect(esNumeroDeBoleta(valor)).toBe(valido);
  });

  it.each(CASOS.telefono.map((c) => [c.valor, c.valido] as const))('teléfono %j → %s', (valor, valido) => {
    expect(esTelefonoValido(valor)).toBe(valido);
  });

  it.each(CASOS.carnet.map((c) => [c.valor, c.valido] as const))('carnet %j → %s', (valor, valido) => {
    expect(esCarnetValido(valor)).toBe(valido);
  });

  it('los bordes de lo escrito se recortan, como en el guardado', () => {
    expect(esNumeroDeBoleta('  001003  ')).toBe(true);
    expect(esTelefonoValido(' 7012 3456 ')).toBe(true);
    expect(esCarnetValido(' 1234567 LP ')).toBe(true);
  });
});
