import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * El DESIGN.md dice lo que el código hace — SPEC-KRILINXI-047.
 *
 * `frontend/DESIGN.md` describe el sistema visual (colores, letra, componentes, patrones) y lo van a leer
 * quienes pulan la interfaz después. Un documento de diseño que nadie vigila deja de ser cierto a las pocas
 * semanas, y entonces engaña: este test lo ata a `src/index.css`, que es de donde salen los colores (el
 * documento los describe, no los reemplaza). Es el mismo patrón con que el proyecto ata una tabla copiada a
 * su original (`estado.test.ts` compara la tabla de avances con la del backend).
 *
 * No juzga si el diseño es bueno: comprueba que lo escrito y lo real coincidan.
 */
const RAIZ = resolve(import.meta.dirname, '../..');
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), 'utf8').replace(/\r\n/g, '\n');

const CSS = leer('src/index.css');
const DOC = leer('DESIGN.md');

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/.exec(DOC)?.[1] ?? '';
const CUERPO = DOC.slice(DOC.indexOf('\n---\n', 3) + 5);

/** Todos los colores `#rrggbb` de un texto, en minúscula y sin repetir. */
const colores = (texto: string) => new Set([...texto.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()));

/** El bloque de un tema de `index.css`: el claro es `@theme`; el oscuro, `:root[data-tema='oscuro']`. */
const BLOQUE_CLARO = /@theme\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';

/** Lo que cuelga de una clave de primer nivel del frontmatter (`colors:`), una entrada por línea. */
function entradas(clave: string): Record<string, string> {
  const desde = FRONTMATTER.indexOf(`\n${clave}:\n`);
  if (desde === -1) return {};
  const resto = FRONTMATTER.slice(desde + clave.length + 3);
  const hasta = resto.search(/\n\S/);
  const bloque = hasta === -1 ? resto : resto.slice(0, hasta);
  return Object.fromEntries(
    [...bloque.matchAll(/^ {2}([\w-]+):\s*"?([^"\n]+)"?\s*$/gm)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
}

describe('DESIGN.md: lo que declara — SPEC-KRILINXI-047', () => {
  it('abre con el frontmatter de tokens: colores, tipografía, radios, espaciados y componentes', () => {
    expect(FRONTMATTER).not.toBe('');
    for (const clave of ['colors', 'typography', 'rounded', 'spacing', 'components']) {
      expect(FRONTMATTER, `falta "${clave}:" en el frontmatter`).toMatch(new RegExp(`\\n${clave}:\\n`));
    }
  });

  it('trae las secciones canónicas del formato en su orden, y no sobra ninguna fuera del formato', () => {
    const CANONICAS = ['Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components', "Do's and Don'ts"];
    const presentes = [...CUERPO.matchAll(/^## (.+)$/gm)].map((m) => m[1] ?? '');

    // Las que aparecen siguen el orden del formato (se puede omitir una que no aplique, no reordenarla).
    expect(presentes.filter((t) => CANONICAS.includes(t))).toEqual(CANONICAS.filter((t) => presentes.includes(t)));
    expect(presentes.filter((t) => !CANONICAS.includes(t))).toEqual([]);
    // Y lo mínimo para que sirva: de qué se trata, los colores, la letra, los componentes y qué evitar.
    for (const obligatoria of ['Overview', 'Colors', 'Typography', 'Components', "Do's and Don'ts"]) {
      expect(presentes).toContain(obligatoria);
    }
  });

  it('las referencias entre tokens existen: cada {colors.x}, {rounded.x} o {typography.x} apunta a algo definido', () => {
    const definidos = {
      colors: entradas('colors'),
      rounded: entradas('rounded'),
      typography: Object.fromEntries([...FRONTMATTER.matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => [m[1] ?? '', ''])),
    } as Record<string, Record<string, string>>;
    const referencias = [...FRONTMATTER.matchAll(/\{(colors|rounded|typography)\.([\w-]+)\}/g)];

    expect(referencias.length).toBeGreaterThan(0);
    const rotas = referencias.filter(([, grupo, nombre]) => !(nombre ?? '') || !((nombre ?? '') in (definidos[grupo ?? ''] ?? {}))).map((m) => m[0]);
    expect(rotas).toEqual([]);
  });
});

describe('DESIGN.md: ata a index.css — SPEC-KRILINXI-047', () => {
  it('no documenta ningún color que el código no use', () => {
    const delCodigo = colores(CSS);
    const inventados = [...colores(DOC)].filter((c) => !delCodigo.has(c));

    expect(inventados).toEqual([]);
  });

  it('no deja sin documentar ningún color del tema, ni el claro ni el oscuro', () => {
    const delDocumento = colores(DOC);
    const sinDocumentar = [...colores(CSS)].filter((c) => !delDocumento.has(c));

    // Un color nuevo en index.css sin su línea acá hace fallar este test: es lo que lo mantiene al día.
    expect(sinDocumentar).toEqual([]);
  });

  it('los colores del frontmatter son los del tema claro', () => {
    const claros = colores(BLOQUE_CLARO);
    const documentados = Object.values(entradas('colors')).map((c) => c.toLowerCase());

    expect(documentados.length).toBeGreaterThan(20);
    expect(documentados.filter((c) => !claros.has(c))).toEqual([]);
  });

  it('el tema oscuro está descrito: cada color propio del oscuro aparece en su sección', () => {
    const oscuro = /:root\[data-tema='oscuro'\]\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    const seccion = /### Tema oscuro([\s\S]*?)(?=\n### |\n## )/.exec(CUERPO)?.[1] ?? '';
    const soloDelOscuro = [...colores(oscuro)].filter((c) => !colores(BLOQUE_CLARO).has(c));

    expect(soloDelOscuro.length).toBeGreaterThan(10);
    expect(soloDelOscuro.filter((c) => !colores(seccion).has(c))).toEqual([]);
  });

  it('la letra y el tamaño base documentados son los del código', () => {
    const familiaDelCodigo = /--font-sans:\s*'([^']+)'/.exec(CSS)?.[1];
    const tamanoDelCodigo = /body\s*\{[^}]*font-size:\s*([\d.]+rem)/.exec(CSS)?.[1];
    const cuerpo = /^ {2}body:\n((?: {4}.+\n?)+)/m.exec(FRONTMATTER)?.[1] ?? '';

    expect(familiaDelCodigo).toBe('Atkinson Hyperlegible');
    expect(cuerpo).toContain(`"${familiaDelCodigo}`);
    expect(cuerpo).toContain(`fontSize: "${tamanoDelCodigo}"`);
  });
});

describe('El complemento .impeccable/design.json — SPEC-KRILINXI-047', () => {
  const RUTA = '.impeccable/design.json';

  it('existe, es JSON y sigue el esquema 2', () => {
    expect(existsSync(resolve(RAIZ, RUTA))).toBe(true);
    const complemento = JSON.parse(leer(RUTA)) as { schemaVersion: number; components: { name: string; html: string; css: string }[] };

    expect(complemento.schemaVersion).toBe(2);
    expect(complemento.components.length).toBeGreaterThan(5);
    for (const componente of complemento.components) {
      expect(componente.html, componente.name).not.toBe('');
      expect(componente.css, componente.name).not.toBe('');
    }
  });

  it('no inventa colores: todos los de sus fragmentos de componentes existen en index.css', () => {
    const delCodigo = colores(CSS);
    const inventados = [...colores(leer(RUTA))].filter((c) => !delCodigo.has(c));

    expect(inventados).toEqual([]);
  });

  it('cada componente al que se refiere existe en el frontmatter del DESIGN.md', () => {
    const complemento = JSON.parse(leer(RUTA)) as { components: { name: string; refersTo?: string }[] };
    const delDocumento = new Set([...FRONTMATTER.matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1] ?? ''));

    const huerfanos = complemento.components.filter((c) => c.refersTo && !delDocumento.has(c.refersTo)).map((c) => c.name);
    expect(huerfanos).toEqual([]);
  });
});
