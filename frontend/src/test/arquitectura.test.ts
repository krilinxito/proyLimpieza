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
  { que: 'una carpeta api/ (pasa por el hook)', patron: /from\s+['"][^'"]*\/api\/[^'"]*['"]/ },
];

describe('Componentes de features sin acceso a la base local — SPEC-KRILINXI-006', () => {
  it('revisa los componentes de más de una feature', () => {
    const rutas = COMPONENTES_DE_FEATURES.map(({ ruta }) => ruta);
    expect(rutas).toContain('features/clientes/components/PantallaClientes.tsx');
    expect(rutas).toContain('features/ordenes/components/FormularioRopa.tsx');
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

/**
 * Sin estilos en línea — SPEC-KRILINXI-020. La política de seguridad del contenido no los permite
 * (`style-src 'self'`): un `style={…}` se vería bien en `npm run dev`, donde no hay política, y
 * en la tablet el navegador lo ignoraría sin avisar. Para algo variable, una clase de una lista
 * escrita entera (`COLOR_METODO` en `features/estadisticas/components/graficos/colores.ts`), o un
 * atributo de SVG, que no es un estilo (`width="42%"`, los gráficos de SPEC-KRILINXI-026).
 */
describe('Los componentes no usan estilos en línea — SPEC-KRILINXI-020', () => {
  it('ningún archivo tsx de la app tiene style={…}', () => {
    const culpables = archivosFuente('features', 'components', 'pages')
      .filter(({ ruta, fuente }) => ruta.endsWith('.tsx') && /\bstyle=\{/.test(sinComentarios(fuente)))
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });
});

/**
 * La app pinta con el tema — SPEC-KRILINXI-022, extendida en SPEC-KRILINXI-024, -025 y -026. Los
 * colores salen de `index.css` (`bg-marca`, `text-peligro-texto`…), no de la paleta de Tailwind
 * (`bg-sky-700`): así cambiar un color es una línea, y el test del tema (`tema.test.ts`) garantiza
 * que se lea.
 *
 * Creció con la ola estética, carpeta por carpeta. Desde SPEC-KRILINXI-027, que pasó al tema las
 * últimas pantallas, cubre **toda** la app: una pantalla o una feature nueva queda vigilada desde
 * su primer archivo, sin tocar esta lista.
 */
const CON_EL_TEMA = ['components', 'pages', 'features'];

const PALETA_CRUDA =
  /\b(?:bg|text|border|ring|outline|fill|stroke|divide|decoration|placeholder|accent|caret|shadow|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\b(?:bg|text|border)-(?:white|black)\b/;

describe('Ninguna parte de la app usa la paleta cruda — SPEC-KRILINXI-022, SPEC-KRILINXI-024, SPEC-KRILINXI-025, SPEC-KRILINXI-026 y SPEC-KRILINXI-027', () => {
  const ARCHIVOS = archivosFuente(...CON_EL_TEMA);

  it('revisa toda la app, no una lista vacía', () => {
    expect(ARCHIVOS.map(({ ruta }) => ruta)).toEqual(
      expect.arrayContaining([
        'components/Boton.tsx',
        'components/Aviso.tsx',
        'pages/Inicio.tsx',
        'pages/NoEncontrada.tsx',
        'features/auth/components/FormularioIngreso.tsx',
        'features/ordenes/components/DetalleOrden.tsx',
        'features/entregas/components/FormularioEntrega.tsx',
        'features/clientes/components/TarjetaCliente.tsx',
        'features/estadisticas/components/graficos/BarrasHorizontales.tsx',
        // Las últimas que pasaron al tema, SPEC-KRILINXI-027.
        'features/usuarios/components/PantallaPersonal.tsx',
        'features/sucursales/components/PantallaSucursales.tsx',
        'features/auditoria/components/TarjetaRegistro.tsx',
        'features/pendientes/components/PantallaParaCorregir.tsx',
      ]),
    );
  });

  it('el patrón reconoce la paleta cruda y deja pasar el tema', () => {
    expect(PALETA_CRUDA.test('bg-sky-700')).toBe(true);
    expect(PALETA_CRUDA.test('hover:text-red-800')).toBe(true);
    expect(PALETA_CRUDA.test('bg-white')).toBe(true);
    expect(PALETA_CRUDA.test('bg-marca text-peligro-texto border-borde-suave')).toBe(false);
  });

  it('ningún archivo de la app usa la paleta cruda de Tailwind', () => {
    const culpables = ARCHIVOS.filter(({ fuente }) => PALETA_CRUDA.test(sinComentarios(fuente))).map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });
});

/**
 * Los gráficos se dibujan con Recharts, y con nada más de afuera — SPEC-KRILINXI-063 (antes, SPEC-KRILINXI-026, eran SVG
 * propios, sin ninguna librería). La decisión se tomó con la persona a cargo, midiendo peso, política de seguridad,
 * funcionamiento sin internet y accesibilidad (está en la bitácora de la 063):
 *
 *  - Recharts es la única librería permitida, y **solo dentro de `graficos/`**: ninguna pantalla ni sección la importa. Así
 *    la librería queda detrás de unas pocas piezas (`Columnas` y `Lineas`; `DetalleFlotante` solo recibe lo que Recharts le pasa) y se puede cambiar sin tocar
 *    nada más.
 *  - Una librería de gráficos nueva, o Recharts fuera de esa carpeta, es otra decisión para hablar en una spec, no un import.
 */
const LIBRERIAS_DE_GRAFICOS = ['recharts'];

describe('Los gráficos usan Recharts y nada más de afuera — SPEC-KRILINXI-063', () => {
  const GRAFICOS = archivosFuente('features/estadisticas/components/graficos');
  const importesDeAfuera = (archivos: typeof GRAFICOS) =>
    archivos.flatMap(({ ruta, fuente }) =>
      [...fuente.matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map(([, modulo]) => modulo ?? '')
        .filter((modulo) => !modulo.startsWith('.') && modulo !== 'react' && modulo !== 'vitest')
        .map((modulo) => ({ ruta, modulo })),
    );

  it('revisa la carpeta de los gráficos, no una lista vacía', () => {
    expect(GRAFICOS.map(({ ruta }) => ruta)).toEqual(
      expect.arrayContaining(['features/estadisticas/components/graficos/Columnas.tsx', 'features/estadisticas/components/graficos/escalas.ts']),
    );
  });

  it('solo importan React, Recharts, vitest en sus tests, y archivos del propio proyecto', () => {
    const deAfuera = importesDeAfuera(GRAFICOS).filter(({ modulo }) => !LIBRERIAS_DE_GRAFICOS.includes(modulo));
    expect(deAfuera).toEqual([]);
  });

  it('Recharts se importa solo desde la carpeta de los gráficos', () => {
    const fuera = archivosFuente('features', 'components', 'pages', 'lib', 'hooks')
      .filter(({ ruta, fuente }) => !ruta.startsWith('features/estadisticas/components/graficos/') && /from\s+['"]recharts['"]/.test(fuente))
      .map(({ ruta }) => ruta);
    // Los tests de las pantallas no importan la librería: miran lo que dibuja.
    expect(fuera).toEqual([]);
  });

  it('las piezas que sí la usan son las de dibujo: columnas y líneas', () => {
    const usan = importesDeAfuera(GRAFICOS)
      .filter(({ modulo }) => modulo === 'recharts')
      .map(({ ruta }) => ruta.split('/').at(-1));
    expect([...new Set(usan)].sort()).toEqual(['Columnas.tsx', 'Lineas.tsx']);
  });
});

/**
 * El `sr-only` nunca va en una `<table>` — SPEC-KRILINXI-036. Chrome dibuja el `<caption>` fuera de
 * la caja recortada de la tabla, así que su texto se ve, encima de lo que haya ahí. Pasó con el
 * nombre de cada gráfico del panel, y jsdom no pinta, así que ningún test lo vio. Lo que se oculta
 * a la vista va dentro de un contenedor con `sr-only` (`Grafico.tsx`).
 */
const SR_ONLY_EN_TABLA = /<table\b[^>]*\bclassName=[^>]*\bsr-only\b/;

describe('La tabla oculta a la vista va dentro de un contenedor — SPEC-KRILINXI-036', () => {
  it('el patrón reconoce el sr-only en la tabla y deja pasar el contenedor', () => {
    expect(SR_ONLY_EN_TABLA.test('<table className="sr-only">')).toBe(true);
    expect(SR_ONLY_EN_TABLA.test('<table id="t" className={`mt-2 sr-only`}>')).toBe(true);
    expect(SR_ONLY_EN_TABLA.test('<div className="sr-only">\n  <table>')).toBe(false);
  });

  it('ningún componente pone sr-only directamente en una <table>', () => {
    const culpables = archivosFuente('features', 'components', 'pages')
      .filter(({ ruta, fuente }) => ruta.endsWith('.tsx') && SR_ONLY_EN_TABLA.test(sinComentarios(fuente)))
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });
});

/**
 * La sucursal de trabajo sale de un solo lugar — SPEC-KRILINXI-029: `useSucursalDeTrabajo`. Un
 * EMPLEADO trabaja en la suya, pero un ADMIN que atiende trabaja en la que eligió, y su
 * `usuario.sucursalId` es null: una pantalla que la leyera de la sesión lo dejaría sin sucursal,
 * y sin avisar. Cubre todo `src/` salvo el propio hook, así una pantalla nueva nace vigilada.
 */
const UNICO_LECTOR = 'features/atencion/hooks/useSucursalDeTrabajo.ts';

const SUCURSAL_DE_LA_SESION = [
  { que: 'usuario.sucursalId', patron: /usuario\??\.sucursalId/ },
  { que: 'sucursalId desarmado del usuario', patron: /\{[^}]*\bsucursalId\b[^}]*\}\s*=\s*[^;]*\busuario\b/ },
];

describe('La sucursal de trabajo, de un solo lugar — SPEC-KRILINXI-029', () => {
  const resto = archivosFuente().filter(({ ruta }) => ruta !== UNICO_LECTOR && !ruta.startsWith('test/'));

  it('el hook existe y es el que la lee', () => {
    const hook = archivosFuente('features/atencion').find(({ ruta }) => ruta === UNICO_LECTOR);
    expect(hook?.fuente).toMatch(/usuario\??\.sucursalId/);
  });

  it('revisa el mostrador, el marco y el inicio', () => {
    expect(resto.map(({ ruta }) => ruta)).toEqual(
      expect.arrayContaining([
        'features/ordenes/hooks/useRegistrarRopa.ts',
        'features/ordenes/hooks/useRopa.ts',
        'features/entregas/hooks/useEntregar.ts',
        'pages/Marco.tsx',
        'pages/Inicio.tsx',
      ]),
    );
  });

  it.each(resto.map((a) => [a.ruta, a.fuente]))('%s no lee la sucursal de la sesión', (_ruta, fuente) => {
    const encontrados = SUCURSAL_DE_LA_SESION.filter(({ patron }) => patron.test(fuente)).map(({ que }) => que);
    expect(encontrados).toEqual([]);
  });
});

/**
 * Ninguna lista larga se muestra de golpe — SPEC-KRILINXI-041. Toda lista que puede crecer se
 * pagina (`<Paginas>`, con el tamaño que pide el ancho de la pantalla: `usePaginado` o
 * `useTamanoDePagina`). Una lista de tarjetas con 200 boletas obliga a bajar con el dedo hasta
 * perderse, y en la tablet del mostrador nadie vuelve a subir.
 *
 * El test no puede saber cuánto crece cada lista, así que obliga a decidirlo: cada archivo con un
 * `<ul>` o `<ol>` tiene que estar en una de las dos listas de abajo. Si no está en ninguna, el test
 * falla y quien escribe la lista elige: la pagina, o explica por qué es corta por construcción.
 */
const PAGINAN = [
  'features/historial/components/PantallaHistorial.tsx',
  'features/mostrador/components/PantallaMostrador.tsx',
  'features/mostrador/components/FichaCliente.tsx',
  'features/mostrador/components/HoyEnLaSucursal.tsx',
  'features/usuarios/components/PantallaPersonal.tsx',
  'features/sucursales/components/PantallaSucursales.tsx',
  'features/pendientes/components/PantallaParaCorregir.tsx',
  'features/auditoria/components/PantallaAuditoria.tsx',
  'features/estadisticas/components/SeccionClientes.tsx',
  'features/estadisticas/components/SeccionSaldos.tsx',
  'features/estadisticas/components/SeccionSinRecoger.tsx',
  'features/estadisticas/components/SeccionProductividad.tsx',
  // SPEC-KRILINXI-061: los últimos clientes y las boletas de un cliente.
  'features/clientes/components/ListaDeRecientes.tsx',
  'features/historial/components/BoletasDelCliente.tsx',
];

/** Listas que no crecen con el negocio, y por qué. */
const CORTAS: Record<string, string> = {
  'components/BuscadorVivo.tsx': 'muestra como mucho 6 resultados y avisa si hay más (SPEC-KRILINXI-032)',
  'components/marco/MenuPrincipal.tsx': 'las pantallas del menú: una docena, fijas en el código',
  'features/ordenes/components/DetalleOrden.tsx': 'los pagos de UNA boleta: dos o tres',
  'features/auditoria/components/TarjetaRegistro.tsx': 'lo que cambió en UN registro: un puñado de campos',
  'features/estadisticas/components/graficos/BarrasHorizontales.tsx': 'las barras de un gráfico, con su propia tabla',
  'features/estadisticas/components/graficos/Leyenda.tsx': 'la leyenda de un gráfico: tres o cuatro series',
  'features/estadisticas/components/graficos/Grafico.tsx': 'el desglose de UN dato elegido en la vista grande: un puñado de líneas (SPEC-KRILINXI-065)',
  'components/AvisoInstalar.tsx': 'los dos pasos fijos de instalar en iPhone, escritos en el código (SPEC-KRILINXI-059)',
};

describe('Las listas largas se paginan — SPEC-KRILINXI-041', () => {
  const CON_LISTA = archivosFuente('features', 'components', 'pages').filter(
    ({ ruta, fuente }) => ruta.endsWith('.tsx') && /<(ul|ol)\b/.test(sinComentarios(fuente)),
  );

  it('revisa las listas de la app, no una lista vacía', () => {
    expect(CON_LISTA.map(({ ruta }) => ruta)).toEqual(expect.arrayContaining([...PAGINAN, ...Object.keys(CORTAS)]));
  });

  it.each(PAGINAN)('%s dibuja la barra de páginas', (ruta) => {
    const archivo = archivosFuente('features').find((a) => a.ruta === ruta);
    expect(archivo?.fuente).toMatch(/<Paginas\b/);
  });

  it('toda lista nueva elige: se pagina, o se declara corta con su motivo', () => {
    const sinDecidir = CON_LISTA.filter(({ ruta }) => !PAGINAN.includes(ruta) && !(ruta in CORTAS)).map(({ ruta }) => ruta);
    expect(sinDecidir).toEqual([]);
  });

  it('el tamaño de página sale de un solo lugar: ningún archivo repite los números 6, 10 y 20 de la regla', () => {
    // Quien necesite el tamaño lo pide a `useTamanoDePagina` / `usePaginado`, que leen `lib/tamanoDePagina.ts`.
    const culpables = archivosFuente('features', 'components', 'pages', 'hooks')
      .filter(({ fuente }) => /(?:por_pagina|porPagina|POR_PAGINA)\s*[:=]\s*(?:6|10|20)\b/.test(sinComentarios(fuente)))
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });
});

describe('La barra de páginas se dibuja en un solo lugar — SPEC-KRILINXI-054', () => {
  it('ningún archivo fuera de components/Paginas.tsx arma su propia barra "Anteriores · Página X de Y · Siguientes"', () => {
    const culpables = archivosFuente('features', 'pages', 'hooks', 'components')
      .filter(({ ruta }) => ruta !== 'components/Paginas.tsx')
      .filter(({ fuente }) => /\bAnteriores\b|\bSiguientes\b|Página \{/.test(sinComentarios(fuente)))
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });
});

/**
 * El tablero de estadísticas en una sola columna, con vista grande — SPEC-KRILINXI-065. Las tarjetas van una debajo de otra,
 * siempre del mismo ancho, y la vista grande es de `SeccionPanel`: dibuja los mismos hijos de la tarjeta, sin pedir nada.
 */
describe('El tablero de estadísticas en una columna y con vista grande — SPEC-KRILINXI-065', () => {
  const tablero = archivosFuente('features').filter(({ ruta }) => ruta.startsWith('features/estadisticas/components/'));

  it('revisa los componentes del tablero, no una lista vacía', () => {
    expect(tablero.map(({ ruta }) => ruta)).toEqual(
      expect.arrayContaining([
        'features/estadisticas/components/PantallaEstadisticas.tsx',
        'features/estadisticas/components/SeccionPanel.tsx',
        'features/estadisticas/components/VistaGrande.tsx',
      ]),
    );
  });

  it('no queda ninguna regla de dos columnas ni tarjeta que ocupe una fila distinta', () => {
    const culpables = tablero
      .filter(({ fuente }) => /lg:grid-cols-2|lg:col-span-2|\bentera\b/.test(sinComentarios(fuente)))
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });

  it('toda tarjeta (Seccion…) decide si se puede agrandar: declara `ampliable`', () => {
    const sinDecidir = tablero
      .filter(({ ruta }) => /\/Seccion[A-Za-z]+\.tsx$/.test(ruta) && !ruta.endsWith('/SeccionPanel.tsx'))
      .filter(({ fuente }) => /<SeccionPanel\b/.test(fuente) && !/\bampliable=/.test(sinComentarios(fuente)))
      .map(({ ruta }) => ruta);
    expect(sinDecidir).toEqual([]);
  });

  it('la vista grande no pide nada: no importa la API ni ningún hook de pedidos', () => {
    const vista = tablero.find(({ ruta }) => ruta.endsWith('/VistaGrande.tsx'));
    expect(vista?.fuente).toBeDefined();
    expect(sinComentarios(vista?.fuente ?? '')).not.toMatch(/lib\/api|hooks\/use(Panel|IngresosPorDia|Productividad|ClientesAtendidos|PedidoOnline)|axios|fetch\(/);
  });

  it('solo SeccionPanel escribe el botón "Agrandar": una pieza nueva no arma el suyo', () => {
    const culpables = archivosFuente('features', 'components', 'pages')
      .filter(({ ruta }) => ruta !== 'features/estadisticas/components/SeccionPanel.tsx')
      .filter(({ fuente }) => /\bAgrandar\b/.test(sinComentarios(fuente)))
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });
});
