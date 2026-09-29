import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  comoObjeto,
  esUuid,
  normalizarTelefono,
  textoConContenido,
} from '../../src/utils/validacion.js';

describe('Validación de la entrada — SPEC-ALE186-003', () => {
  it('acepta el UUID que genera el dispositivo con crypto.randomUUID()', () => {
    expect(esUuid(randomUUID())).toBe(true);
    expect(esUuid('44444444-4444-4444-4444-444444444444')).toBe(true);
  });

  it.each([
    ['vacío', ''],
    ['un número de boleta', '001234'],
    ['un UUID sin guiones', '44444444444444444444444444444444'],
    ['un UUID con un carácter de más', '44444444-4444-4444-4444-4444444444445'],
    ['un intento de inyección', "' OR 1=1 --"],
    ['un número', 42],
    ['nada', undefined],
  ])('rechaza como UUID: %s', (_caso, valor) => {
    expect(esUuid(valor)).toBe(false);
  });

  it.each([
    ['con guion', '7012-3456', '70123456'],
    ['con espacios', '701 23 456', '70123456'],
    ['con paréntesis y prefijo', '(+591) 70123456', '59170123456'],
    ['ya limpio', '70123456', '70123456'],
    ['sin ningún dígito', 'sin teléfono', ''],
  ])('normaliza el teléfono %s', (_caso, entrada, esperado) => {
    // Lo que se prueba es la regla de unicidad: si estas dos formas dieran
    // resultados distintos, la base las vería como dos clientes.
    expect(normalizarTelefono(entrada)).toBe(esperado);
  });

  it('recorta el texto y trata el vacío como ausente', () => {
    expect(textoConContenido('  Ana  ')).toBe('Ana');
    expect(textoConContenido('   ')).toBeNull();
    expect(textoConContenido(123)).toBeNull();
  });

  it('trata un cuerpo que no es objeto como uno vacío', () => {
    // express.json() puede dejar en req.body un array, un número o nada.
    expect(comoObjeto([1, 2])).toEqual({});
    expect(comoObjeto('texto')).toEqual({});
    expect(comoObjeto(undefined)).toEqual({});
    expect(comoObjeto({ nombre: 'Ana' })).toEqual({ nombre: 'Ana' });
  });
});
