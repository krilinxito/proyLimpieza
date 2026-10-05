import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  contrasenaValida,
  textoHasta,
  comoObjeto,
  esFechaCalendario,
  esInstanteConZona,
  esUuid,
  montoEnCentavos,
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

describe('Validación de montos y fechas — SPEC-ALE186-004', () => {
  it.each([
    ['"45.50"', '45.50', 4550],
    ['un número', 45.5, 4550],
    ['un entero', 45, 4500],
    ['cero', '0', 0],
    ['un negativo (el signo lo decide cada controller)', '-3', -300],
  ])('convierte a centavos %s', (_caso, valor, esperado) => {
    expect(montoEnCentavos(valor)).toBe(esperado);
  });

  it.each([
    ['un float contaminado', 0.1 + 0.2],
    ['tres decimales', '1.005'],
    ['texto', 'veinte'],
    ['vacío', ''],
    ['null', null],
    ['un objeto', { monto: 1 }],
  ])('rechaza %s', (_caso, valor) => {
    expect(montoEnCentavos(valor)).toBeNull();
  });

  it('acepta una fecha de calendario que existe', () => {
    expect(esFechaCalendario('2026-10-03')).toBe(true);
    expect(esFechaCalendario('2028-02-29')).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '03/10/2026', '2026-10-03T00:00:00Z', 20261003])(
    'rechaza %s como fecha de calendario',
    (valor) => {
      expect(esFechaCalendario(valor)).toBe(false);
    },
  );

  it('acepta un instante con zona, como el de new Date().toISOString()', () => {
    expect(esInstanteConZona(new Date().toISOString())).toBe(true);
    expect(esInstanteConZona('2026-09-30T14:00:00-04:00')).toBe(true);
  });

  it.each([
    ['sin zona (no se puede interpretar sin adivinar)', '2026-09-30T14:00:00'],
    ['con el formato de Postgres', '2026-09-30 14:00:00'],
    ['una fecha sola', '2026-09-30'],
    ['una hora imposible', '2026-09-30T25:00:00Z'],
    ['un número', 1759240800000],
  ])('rechaza un instante %s', (_caso, valor) => {
    expect(esInstanteConZona(valor)).toBe(false);
  });
});

describe('Validación de textos con tope y contraseñas — SPEC-ALE186-009', () => {
  it('textoHasta recorta y acepta hasta el tope, ni una letra más', () => {
    expect(textoHasta('  rosa  ', 4)).toBe('rosa');
    expect(textoHasta('rosas', 4)).toBeNull();
    expect(textoHasta('   ', 4)).toBeNull();
    expect(textoHasta(42, 4)).toBeNull();
  });

  it('contrasenaValida exige 8 caracteres como mínimo', () => {
    expect(contrasenaValida('1234567')).toBeNull();
    expect(contrasenaValida('12345678')).toBe('12345678');
  });

  it('contrasenaValida no recorta: los espacios también son parte de la contraseña', () => {
    expect(contrasenaValida(' clave larga ')).toBe(' clave larga ');
  });

  it('contrasenaValida mide el máximo en bytes, que es lo que lee bcrypt', () => {
    // 36 eñes son 36 letras pero 72 bytes en UTF-8: entra justo. 37, ya no.
    expect(contrasenaValida('ñ'.repeat(36))).not.toBeNull();
    expect(contrasenaValida('ñ'.repeat(37))).toBeNull();
  });

  it('contrasenaValida rechaza lo que no es texto', () => {
    expect(contrasenaValida(12345678)).toBeNull();
    expect(contrasenaValida(undefined)).toBeNull();
  });
});
