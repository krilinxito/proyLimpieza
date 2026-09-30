import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Los componentes compartidos no piden datos: todo les llega por props (CLAUDE.md §5).
 *
 * Es una regla de arquitectura, y la forma más barata de sostenerla es un test que lea el
 * código fuente y falle si alguien la rompe. No prueba comportamiento: prueba que ninguna
 * pieza de `components/` importe algo que hable con la API, con PowerSync o con una feature.
 */
const CARPETA = import.meta.dirname;

const componentes = readdirSync(CARPETA).filter(
  (archivo) => /\.tsx?$/.test(archivo) && !/\.test\.tsx?$/.test(archivo),
);

const PROHIBIDOS = [
  { que: 'axios', patron: /from\s+['"]axios['"]/ },
  { que: 'PowerSync', patron: /from\s+['"]@powersync\// },
  { que: 'una feature', patron: /from\s+['"][^'"]*features\// },
  { que: 'fetch', patron: /\bfetch\(/ },
];

describe('Componentes compartidos sin acceso a datos — SPEC-KRILINXI-002', () => {
  it('hay componentes que revisar', () => {
    expect(componentes.length).toBeGreaterThan(0);
  });

  it.each(componentes)('%s no llama a axios, PowerSync, fetch ni a una feature', (archivo) => {
    const fuente = readFileSync(resolve(CARPETA, archivo), 'utf8');
    const encontrados = PROHIBIDOS.filter(({ patron }) => patron.test(fuente)).map(({ que }) => que);
    expect(encontrados).toEqual([]);
  });
});
