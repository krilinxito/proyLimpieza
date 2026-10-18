import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * El tema se lee — SPEC-KRILINXI-022.
 *
 * Los colores viven en `index.css` (`@theme`). Este test los lee de ahí y calcula el contraste
 * de cada texto sobre su fondo con la fórmula de WCAG 2: si alguien aclara un gris "porque queda
 * más lindo", falla antes de que una persona mayor se quede sin poder leer un saldo.
 *
 * jsdom no pinta (ver `estilos.test.tsx`), así que no se puede medir la pantalla: se mide el
 * tema, que es de donde salen todos los colores. Que los componentes no usen otros lo vigila el
 * test de arquitectura (`arquitectura.test.ts`).
 */
const CSS = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8');

/**
 * Cada tema es un bloque de `index.css` (SPEC-KRILINXI-030): el claro es `@theme`, el oscuro
 * redefine los mismos tokens bajo `[data-tema='oscuro']`. Los pares se miden en los dos.
 */
type NombreTema = 'claro' | 'oscuro';
const BLOQUES: Record<NombreTema, RegExp> = {
  claro: /@theme\s*\{([^}]*)\}/,
  oscuro: /:root\[data-tema='oscuro'\]\s*\{([^}]*)\}/,
};
const TEMAS: NombreTema[] = ['claro', 'oscuro'];

function bloque(tema: NombreTema): string {
  const contenido = BLOQUES[tema].exec(CSS)?.[1];
  if (!contenido) throw new Error(`index.css no tiene el bloque del tema ${tema}.`);
  return contenido;
}

/** Los nombres de color que declara un bloque: `marca`, `texto-suave`… */
function nombresDeColor(css: string): string[] {
  return [...css.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1] ?? '');
}

function color(nombre: string, tema: NombreTema = 'claro'): string {
  const valor = new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(bloque(tema))?.[1];
  if (!valor) throw new Error(`El tema ${tema} no declara --color-${nombre} en hexadecimal.`);
  return valor;
}

/** Luminancia relativa de WCAG 2: cuánto "pesa" un color para el ojo, de 0 (negro) a 1 (blanco). */
function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** De 1:1 (iguales) a 21:1 (negro sobre blanco). */
function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro ?? 0) + 0.05) / ((oscuro ?? 0) + 0.05);
}

/** Cada texto con cada fondo sobre el que aparece. Un par nuevo en la app, una línea nueva acá. */
const TEXTOS: [texto: string, fondo: string][] = [
  ['texto', 'fondo'],
  ['texto', 'superficie'],
  ['texto-suave', 'fondo'],
  ['texto-suave', 'superficie'],
  ['sobre-marca', 'marca'],
  ['sobre-marca', 'marca-fuerte'],
  ['marca', 'superficie'],
  ['marca-fuerte', 'marca-suave'],
  ['sobre-marca', 'peligro'],
  ['sobre-marca', 'peligro-fuerte'],
  ['info-texto', 'info-fondo'],
  ['exito-texto', 'exito-fondo'],
  ['advertencia-texto', 'advertencia-fondo'],
  ['peligro-texto', 'peligro-fondo'],
  ['peligro-texto', 'superficie'],
  // El enlace a "para corregir" va dentro del aviso de sin internet (AvisoConexion).
  ['peligro-texto', 'advertencia-fondo'],
  // La opción elegida (método de pago, sucursal…) se marca con `bg-marca-suave` y texto normal.
  ['texto', 'marca-suave'],
];

/**
 * Lo que no es texto pero hay que ver para usarlo: el borde de un campo, el anillo del foco.
 * WCAG pide 3:1 (criterio 1.4.11).
 */
const CONTROLES: [control: string, fondo: string][] = [
  ['borde', 'superficie'],
  ['borde', 'fondo'],
  ['foco', 'superficie'],
  ['foco', 'fondo'],
  ['peligro', 'superficie'],
];

/**
 * Las marcas de los gráficos (SPEC-KRILINXI-026): una barra también hay que verla, 3:1 contra la
 * superficie donde se dibuja. Que las series se distingan entre sí con daltonismo no se mide acá:
 * lo mide el validador de la guía de visualización, y su resultado está en la bitácora.
 */
const MARCAS = ['serie-1', 'serie-2', 'serie-3', 'serie-4', 'antiguedad-1', 'antiguedad-2', 'antiguedad-3'];

describe('El tema se lee — SPEC-KRILINXI-022', () => {
  it('la fórmula da lo que dice WCAG en los extremos', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it.each(TEXTOS)('%s sobre %s llega a 4,5:1 (WCAG AA)', (texto, fondo) => {
    expect(contraste(color(texto), color(fondo))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CONTROLES)('%s sobre %s llega a 3:1', (control, fondo) => {
    expect(contraste(color(control), color(fondo))).toBeGreaterThanOrEqual(3);
  });

  it('la letra base es de al menos 18px', () => {
    const base = /body\s*\{[^}]*font-size:\s*([\d.]+)rem/.exec(CSS)?.[1];
    expect(Number(base) * 16).toBeGreaterThanOrEqual(18);
  });

  it('la letra de la app es Atkinson Hyperlegible, y del propio sitio', () => {
    expect(CSS).toMatch(/--font-sans:\s*'Atkinson Hyperlegible'/);
    expect(CSS).not.toMatch(/fonts\.googleapis|https?:\/\//);
  });
});

describe('Los colores de los gráficos se ven — SPEC-KRILINXI-026', () => {
  it.each(MARCAS)('%s sobre la superficie llega a 3:1', (marca) => {
    expect(contraste(color(marca), color('superficie'))).toBeGreaterThanOrEqual(3);
  });

  // Desde SPEC-KRILINXI-030 se mide como contraste y no como "más oscura": en el tema oscuro, lo
  // que resalta sobre la superficie es lo más claro. La regla de fondo es la misma en los dos.
  it.each(TEMAS)('en el tema %s, la antigüedad resalta de a un paso: más vieja, más contraste', (tema) => {
    const fondo = color('superficie', tema);
    const [nueva, media, vieja] = ['antiguedad-1', 'antiguedad-2', 'antiguedad-3'].map((n) =>
      contraste(color(n, tema), fondo),
    );
    expect(media).toBeGreaterThan(nueva ?? 0);
    expect(vieja).toBeGreaterThan(media ?? 0);
  });
});

describe('El tema oscuro se lee — SPEC-KRILINXI-030', () => {
  it('redefine todos los colores del tema claro, ni uno menos', () => {
    expect(nombresDeColor(bloque('oscuro')).sort()).toEqual(nombresDeColor(bloque('claro')).sort());
  });

  it.each(TEXTOS)('%s sobre %s llega a 4,5:1 también en oscuro', (texto, fondo) => {
    expect(contraste(color(texto, 'oscuro'), color(fondo, 'oscuro'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CONTROLES)('%s sobre %s llega a 3:1 también en oscuro', (control, fondo) => {
    expect(contraste(color(control, 'oscuro'), color(fondo, 'oscuro'))).toBeGreaterThanOrEqual(3);
  });

  it.each(MARCAS)('%s sobre la superficie oscura llega a 3:1', (marca) => {
    expect(contraste(color(marca, 'oscuro'), color('superficie', 'oscuro'))).toBeGreaterThanOrEqual(3);
  });

  it('el primer instante (antes de que arranque la app) usa los mismos colores que el tema oscuro', () => {
    const instante = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-tema\]\)\s*\{([^}]*)\}/.exec(CSS)?.[1];
    expect(instante).toBeDefined();
    for (const nombre of nombresDeColor(instante ?? '')) {
      expect(new RegExp(`--color-${nombre}:\\s*${color(nombre, 'oscuro')};`).test(instante ?? '')).toBe(true);
    }
    expect(nombresDeColor(instante ?? '')).toEqual(['fondo', 'texto']);
  });
});
