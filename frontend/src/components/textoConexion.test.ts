import { describe, expect, it } from 'vitest';
import { fraseConexion, resumenConexion } from './textoConexion';

describe('La conexión en corto, para la píldora — SPEC-KRILINXI-031', () => {
  it.each<[string, boolean, number, string]>([
    ['con internet y todo guardado', true, 0, 'Con internet'],
    ['con internet y guardando', true, 2, 'Con internet · guardando 2'],
    ['sin internet y nada pendiente', false, 0, 'Sin internet'],
    ['sin internet y con pendientes', false, 3, 'Sin internet · 3 por guardar'],
  ])('%s: "%s"', (_caso, conectado, pendientes, esperado) => {
    expect(resumenConexion({ conectado, pendientes })).toBe(esperado);
  });

  it('la frase completa sigue siendo la de siempre', () => {
    expect(fraseConexion({ conectado: false, pendientes: 1 })).toBe(
      'Trabajando sin internet — 1 registro se guardará cuando vuelva la conexión.',
    );
  });
});
