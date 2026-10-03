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

describe('PowerSync encerrado en lib/powersync — SPEC-KRILINXI-004', () => {
  // `test/` queda afuera a propósito: el doble de los tests necesita el SDK de Node.
  const fuera = archivosFuente().filter(
    ({ ruta }) => !ruta.startsWith('lib/powersync/') && !ruta.startsWith('test/'),
  );

  it('revisa el resto del código, no una lista vacía', () => {
    expect(fuera.map(({ ruta }) => ruta)).toContain('features/auth/SesionProvider.tsx');
  });

  it('ningún archivo fuera de lib/powersync importa @powersync/*', () => {
    const intrusos = fuera.filter(({ fuente }) => /from\s+['"]@powersync\//.test(fuente)).map(({ ruta }) => ruta);
    expect(intrusos).toEqual([]);
  });
});

describe('Pantallas sin acceso directo a datos — SPEC-KRILINXI-003', () => {
  it('hay pantallas que revisar', () => {
    expect(PANTALLAS.map(({ ruta }) => ruta)).toContain('features/auth/components/FormularioIngreso.tsx');
  });

  it.each(PANTALLAS.map((a) => [a.ruta, a.fuente]))('%s no llama a axios ni lee el almacenamiento', (_ruta, fuente) => {
    const encontrados = PROHIBIDOS.filter(({ patron }) => patron.test(fuente)).map(({ que }) => que);
    expect(encontrados).toEqual([]);
  });
});

/**
 * Los componentes de las features no tocan la base local: piden lo que necesitan a un hook,
 * que llama a `features/<x>/api` (CLAUDE.md §5). Nació en SPEC-KRILINXI-005 solo para
 * clientes; con la segunda feature pasó aquí, para todas.
 */
const COMPONENTES_DE_FEATURES = PANTALLAS.filter(({ ruta }) => ruta.startsWith('features/'));

const ACCESO_A_LA_BASE = [
  { que: 'lib/powersync', patron: /from\s+['"][^'"]*lib\/powersync['"]/ },
  { que: 'useBaseLocal', patron: /\buseBaseLocal\b/ },
  { que: 'SQL (consultar/ejecutar)', patron: /\.(consultar|ejecutar)\(/ },
  { que: 'una carpeta api/ (pasá por el hook)', patron: /from\s+['"][^'"]*\/api\/[^'"]*['"]/ },
];

describe('Componentes de features sin acceso a la base local — SPEC-KRILINXI-006', () => {
  it('revisa los componentes de más de una feature', () => {
    const rutas = COMPONENTES_DE_FEATURES.map(({ ruta }) => ruta);
    expect(rutas).toContain('features/clientes/components/PantallaClientes.tsx');
    expect(rutas).toContain('features/ordenes/components/PantallaRegistrarRopa.tsx');
  });

  it.each(COMPONENTES_DE_FEATURES.map((a) => [a.ruta, a.fuente]))('%s pasa por un hook', (_ruta, fuente) => {
    const encontrados = ACCESO_A_LA_BASE.filter(({ patron }) => patron.test(fuente)).map(({ que }) => que);
    expect(encontrados).toEqual([]);
  });
});
