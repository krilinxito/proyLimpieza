import { describe, expect, it } from 'vitest';
import { baseLocalDePrueba } from '../test/baseLocalDePrueba';
import { alcanzaParaBuscar, escaparLike, plegar, plegarSql, terminos } from './texto';

const NOMBRES = ['José Quispe', 'NÚÑEZ', 'María Ángeles Güemes', 'Ñandú Pérez', 'Iñaki Íñiguez', 'Rosa'];

describe('Plegar el texto para buscar — SPEC-KRILINXI-032', () => {
  it('quita tildes y mayúsculas, y la ñ pasa a n', () => {
    expect(plegar('José Núñez')).toBe('jose nunez');
    expect(plegar('GÜEMES')).toBe('guemes');
  });

  // Las dos versiones tienen que dar lo mismo: si no, "jose" no encontraría a "José" en la base
  // aunque el test de JavaScript pasara. Se prueban contra SQLite de verdad.
  it.each(NOMBRES)('el SQL pliega "%s" igual que JavaScript', async (nombre) => {
    const { control } = await baseLocalDePrueba();
    const [fila] = await control.base.consultar(`SELECT ${plegarSql('?')} AS plegado`, [nombre]);
    expect(fila?.plegado).toBe(plegar(nombre));
  });

  it('un % o un _ escritos se buscan tal cual, no como comodines', () => {
    expect(escaparLike('50%_a')).toBe('50\\%\\_a');
  });

  it('separa las palabras, ya plegadas', () => {
    expect(terminos('  José   qui ')).toEqual(['jose', 'qui']);
  });

  it.each<[string, boolean]>([
    ['r', false],
    ['ro', true],
    ['70', false],
    ['701', true],
    ['  ', false],
    ['Ñu', true],
  ])('"%s" alcanza para buscar: %s', (texto, alcanza) => {
    expect(alcanzaParaBuscar(texto)).toBe(alcanza);
  });
});
