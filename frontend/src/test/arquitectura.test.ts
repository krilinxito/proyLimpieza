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

/**
 * Las fechas que se guardan salen de `horaOficial()` (`lib/reloj`), no del reloj de la tablet
 * a secas: si la tablet está mal, la fecha quedaría mal (CLAUDE.md §13) — SPEC-KRILINXI-012.
 *
 * Es más estricto que "las fechas que se guardan": ningún archivo de features lee la hora de
 * ahora por su cuenta. Si alguno la necesita para otra cosa (como el vencimiento del token en
 * `features/auth/renovacion.ts`), la recibe como argumento, que además lo hace testeable.
 * `new Date(algo)` sí se permite: convierte una fecha que ya existe, no lee el reloj.
 */
const DE_FEATURES = archivosFuente('features');

/** Sin comentarios: que un comentario diga "Date.now()" no es leer el reloj. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('Las features no leen el reloj de la tablet — SPEC-KRILINXI-012', () => {
  it('revisa los archivos que escriben fechas', () => {
    const rutas = DE_FEATURES.map(({ ruta }) => ruta);
    expect(rutas).toEqual(
      expect.arrayContaining([
        'features/ordenes/api/ordenesLocal.ts',
        'features/ordenes/api/ropaLocal.ts',
        'features/entregas/api/entregasLocal.ts',
      ]),
    );
  });

  it('ninguno llama a new Date() sin argumentos ni a Date.now()', () => {
    const culpables = DE_FEATURES.filter(({ fuente }) => /new Date\(\s*\)|Date\.now\(\s*\)/.test(sinComentarios(fuente))).map(
      ({ ruta }) => ruta,
    );
    expect(culpables).toEqual([]);
  });
});

/**
 * Las estadísticas se leen de la API, nunca de la base local (CLAUDE.md §8) — SPEC-KRILINXI-015.
 *
 * Sin internet, el panel tiene que decir "Las estadísticas necesitan conexión": si alguna
 * métrica saliera de la tablet, mostraría números a medias (solo lo que bajó) sin avisar. El
 * catálogo de sucursales del filtro sí es de la base local, pero desde SPEC-KRILINXI-017 lo da
 * la feature de sucursales (`useSucursalesAbiertas`): ningún archivo de esta feature la toca.
 */
const DE_ESTADISTICAS = archivosFuente('features/estadisticas');
const LEEN_LA_BASE_LOCAL: string[] = [];

describe('Las estadísticas no salen de la base local — SPEC-KRILINXI-015', () => {
  it('revisa la feature entera', () => {
    expect(DE_ESTADISTICAS.map(({ ruta }) => ruta)).toEqual(
      expect.arrayContaining(['features/estadisticas/api/estadisticasApi.ts', 'features/estadisticas/hooks/usePanel.ts']),
    );
  });

  it('solo la lista de sucursales toca la base local', () => {
    const culpables = DE_ESTADISTICAS.filter(
      ({ ruta, fuente }) =>
        !LEEN_LA_BASE_LOCAL.includes(ruta) && /lib\/powersync|useBaseLocal|\.consultar\(/.test(sinComentarios(fuente)),
    ).map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });

  it('las métricas se piden con lib/api', () => {
    const cliente = DE_ESTADISTICAS.find(({ ruta }) => ruta === 'features/estadisticas/api/estadisticasApi.ts');
    expect(cliente?.fuente).toMatch(/from\s+['"]\.\.\/\.\.\/\.\.\/lib\/api['"]/);
  });
});

/**
 * El admin escribe directo a la API, nunca en la base local — SPEC-KRILINXI-017.
 *
 * El alta de una cuenta y el cambio de contraseña llevan la contraseña. Si se escribieran en la
 * base local, quedaría en la cola de subida (una tabla del SQLite de la tablet) hasta subir. Por
 * eso las features del personal y de las sucursales solo LEEN la base local: ninguna escribe.
 */
const DEL_ADMIN = archivosFuente('features/usuarios', 'features/sucursales');

describe('El personal y las sucursales no escriben en la base local — SPEC-KRILINXI-017', () => {
  it('revisa las dos features', () => {
    expect(DEL_ADMIN.map(({ ruta }) => ruta)).toEqual(
      expect.arrayContaining(['features/usuarios/api/cuentasApi.ts', 'features/sucursales/api/sucursalesApi.ts']),
    );
  });

  it('ninguna llama a ejecutar ni arma un INSERT, UPDATE o DELETE', () => {
    const culpables = DEL_ADMIN.filter(({ fuente }) =>
      /\.ejecutar(Juntas)?\(|\b(INSERT|UPDATE|DELETE)\b/.test(sinComentarios(fuente)),
    ).map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });
});
