import { describe, expect, it } from 'vitest';
import { POR_PAGINA_ANCHA, POR_PAGINA_ANGOSTA, POR_PAGINA_MEDIANA, tamanoDePagina } from './tamanoDePagina';

describe('Cuántas filas entran en una página — SPEC-KRILINXI-041', () => {
  it.each([
    [320, POR_PAGINA_ANGOSTA],
    [639, POR_PAGINA_ANGOSTA],
    [640, POR_PAGINA_MEDIANA],
    [768, POR_PAGINA_MEDIANA],
    [1023, POR_PAGINA_MEDIANA],
    [1024, POR_PAGINA_ANCHA],
    [1920, POR_PAGINA_ANCHA],
  ])('en una pantalla de %ipx entran %i', (ancho, esperadas) => {
    expect(tamanoDePagina(ancho)).toBe(esperadas);
  });

  it('cuanto más angosta la pantalla, menos filas: 6, 10 y 20', () => {
    expect([POR_PAGINA_ANGOSTA, POR_PAGINA_MEDIANA, POR_PAGINA_ANCHA]).toEqual([6, 10, 20]);
  });
});
