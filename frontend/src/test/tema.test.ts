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

function color(nombre: string): string {
  const valor = new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(CSS)?.[1];
  if (!valor) throw new Error(`El tema no declara --color-${nombre} en hexadecimal.`);
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

  it('la antigüedad se oscurece de a un paso: más vieja, más oscura', () => {
    const [nueva, media, vieja] = ['antiguedad-1', 'antiguedad-2', 'antiguedad-3'].map((n) => luminancia(color(n)));
    expect(nueva).toBeGreaterThan(media ?? 0);
    expect(media).toBeGreaterThan(vieja ?? 0);
  });
});
