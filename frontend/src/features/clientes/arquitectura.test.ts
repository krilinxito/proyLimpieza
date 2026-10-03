import { describe, expect, it } from 'vitest';
import { archivosFuente } from '../../test/arquitectura';

/**
 * Los componentes de clientes no tocan la base local: piden lo que necesitan a
 * `hooks/useClientes`, que a su vez llama a `api/clientesLocal` (CLAUDE.md §5).
 *
 * `test/arquitectura.test.ts` ya prohíbe axios y el almacenamiento en todas las pantallas;
 * esto añade lo propio de la base local. Es el patrón que van a copiar las features
 * siguientes, así que se vigila desde la primera.
 */
const COMPONENTES = archivosFuente('features/clientes/components');

const PROHIBIDOS = [
  { que: 'lib/powersync', patron: /from\s+['"][^'"]*lib\/powersync['"]/ },
  { que: 'useBaseLocal', patron: /\buseBaseLocal\b/ },
  { que: 'SQL (consultar/ejecutar)', patron: /\.(consultar|ejecutar)\(/ },
  { que: 'la carpeta api/ (pasá por el hook)', patron: /from\s+['"]\.\.\/api\// },
];

describe('Clientes: los componentes pasan por el hook — SPEC-KRILINXI-005', () => {
  it('hay componentes que revisar', () => {
    expect(COMPONENTES.map(({ ruta }) => ruta)).toContain('features/clientes/components/PantallaClientes.tsx');
  });

  it.each(COMPONENTES.map((a) => [a.ruta, a.fuente]))('%s no consulta la base local por su cuenta', (_ruta, fuente) => {
    const encontrados = PROHIBIDOS.filter(({ patron }) => patron.test(fuente)).map(({ que }) => que);
    expect(encontrados).toEqual([]);
  });
});
