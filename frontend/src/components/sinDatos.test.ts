import { describe, expect, it } from 'vitest';
import { archivosFuente } from '../test/arquitectura';

/**
 * Los componentes compartidos no piden datos: todo les llega por props (CLAUDE.md §5).
 *
 * Es una regla de arquitectura, y la forma más barata de sostenerla es un test que lea el
 * código fuente y falle si alguien la rompe. No prueba comportamiento: prueba que ninguna
 * pieza de `components/` importe algo que hable con la API, con PowerSync o con una feature.
 */
// Con subcarpetas: desde SPEC-KRILINXI-023 el marco vive en `components/marco/`, y antes solo se
// leía el primer nivel. `archivosFuente` recorre todo y deja afuera los tests.
const componentes = archivosFuente('components');

const PROHIBIDOS = [
  { que: 'axios', patron: /from\s+['"]axios['"]/ },
  { que: 'PowerSync', patron: /from\s+['"]@powersync\// },
  { que: 'una feature', patron: /from\s+['"][^'"]*features\// },
  { que: 'fetch', patron: /\bfetch\(/ },
];

describe('Componentes compartidos sin acceso a datos — SPEC-KRILINXI-002', () => {
  it('hay componentes que revisar, también los de las subcarpetas (SPEC-KRILINXI-023)', () => {
    expect(componentes.map(({ ruta }) => ruta)).toEqual(
      expect.arrayContaining(['components/Boton.tsx', 'components/marco/Cabecera.tsx', 'components/marco/MenuCompacto.tsx']),
    );
  });

  it.each(componentes.map((c) => [c.ruta, c.fuente]))('%s no llama a axios, PowerSync, fetch ni a una feature', (_ruta, fuente) => {
    const encontrados = PROHIBIDOS.filter(({ patron }) => patron.test(fuente)).map(({ que }) => que);
    expect(encontrados).toEqual([]);
  });
});
