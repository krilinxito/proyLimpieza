import { describe, expect, it } from 'vitest';
import { archivosFuente } from './arquitectura';

/**
 * Las pantallas no hablan con el servidor ni con el almacenamiento: pasan por
 * `features/<x>/api`, por `lib/api` o por un hook (CLAUDE.md §5).
 *
 * Cubre `pages/` y los `components/` de TODAS las features, también las que todavía no
 * existen: una feature nueva queda vigilada sin tocar este test.
 */
const PANTALLAS = archivosFuente('pages', 'features').filter(
  ({ ruta }) => ruta.startsWith('pages/') || /^features\/[^/]+\/components\//.test(ruta),
);

const PROHIBIDOS = [
  { que: 'axios', patron: /from\s+['"]axios['"]/ },
  { que: 'fetch', patron: /\bfetch\(/ },
  { que: 'localStorage', patron: /\blocalStorage\b/ },
  { que: 'sessionStorage', patron: /\bsessionStorage\b/ },
  { que: 'el almacén de la sesión', patron: /from\s+['"][^'"]*\/almacen['"]/ },
];

describe('Pantallas sin acceso directo a datos — SPEC-KRILINXI-003', () => {
  it('hay pantallas que revisar', () => {
    expect(PANTALLAS.map(({ ruta }) => ruta)).toContain('features/auth/components/FormularioIngreso.tsx');
  });

  it.each(PANTALLAS.map((a) => [a.ruta, a.fuente]))('%s no llama a axios ni lee el almacenamiento', (_ruta, fuente) => {
    const encontrados = PROHIBIDOS.filter(({ patron }) => patron.test(fuente)).map(({ que }) => que);
    expect(encontrados).toEqual([]);
  });
});
