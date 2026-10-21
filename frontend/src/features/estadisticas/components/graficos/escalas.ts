/**
 * Las cuentas de los gráficos del panel — SPEC-KRILINXI-026: cuánto mide cada barra, dónde empieza
 * cada tramo y qué días del eje llevan rótulo. Funciones puras, sin React, con su propio test
 * (`escalas.test.ts`): es la parte con aritmética, y se prueba sin montar ninguna pantalla.
 *
 * Todo sale en **porcentajes**, porque los gráficos son SVG sin `viewBox`: un `width="42%"` se
 * estira con la pantalla, y el texto queda de su tamaño de siempre en vez de achicarse con el
 * dibujo. Y van como atributos del SVG, nunca como `style`, que la política de seguridad bloquea
 * (SPEC-KRILINXI-020).
 *
 * Las cuentas son solo de geometría: ningún número que se muestra sale de acá. Los montos que se
 * leen vienen sumados del servidor (CLAUDE.md §8).
 */

/** Hasta dónde llega la barra más larga, en % del ancho: el valor va arriba, no en la punta. */
export const TOPE_BARRA = 100;

/** Hasta dónde llega la columna más alta, en % del alto: arriba va su rótulo. */
export const TOPE_COLUMNA = 82;

/** Lo mínimo que mide algo que no es cero, para que no desaparezca al lado de uno muy grande. */
const MINIMO_VISIBLE = 1;

/** Cuánto mide `valor` si `maximo` mide `tope`. Cero o negativo no ocupa lugar. */
export function largo(valor: number, maximo: number, tope: number = TOPE_BARRA): number {
  if (!(valor > 0) || !(maximo > 0)) return 0;
  return redondear(Math.max(MINIMO_VISIBLE, (valor / maximo) * tope));
}

export type TramoDeBarra = { clave: string; valor: number };

/**
 * Los tramos de una barra apilada, uno detrás del otro, en el orden en que llegan. Un tramo en
 * cero no ocupa lugar ni aparece: así el que sigue arranca donde terminó el anterior.
 * `maximo` es el de la barra más larga del gráfico, para que todas usen la misma escala. Lo demás
 * que traiga cada tramo (su color) sigue con él.
 */
export function apilar<T extends TramoDeBarra>(tramos: readonly T[], maximo: number, tope: number = TOPE_BARRA): (T & { desde: number; ancho: number })[] {
  const ubicados: (T & { desde: number; ancho: number })[] = [];
  let desde = 0;
  for (const tramo of tramos) {
    const ancho = largo(tramo.valor, maximo, tope);
    if (ancho === 0) continue;
    ubicados.push({ ...tramo, desde: redondear(desde), ancho });
    desde += ancho;
  }
  return ubicados;
}

/**
 * Qué columnas del eje llevan su fecha escrita. Con 30 días no entran 30 fechas legibles: se
 * escriben unas pocas, repartidas, siempre la primera y la última. Las demás se leen en el
 * detalle de cada columna y en la tabla.
 */
export function rotulosDelEje(cantidad: number, maximo = 6): Set<number> {
  if (cantidad <= maximo) return new Set(Array.from({ length: cantidad }, (_, i) => i));
  const paso = Math.ceil((cantidad - 1) / (maximo - 1));
  const elegidos = new Set<number>();
  for (let i = 0; i < cantidad - 1; i += paso) elegidos.add(i);
  // La última siempre; si la anterior le queda muy pegada, se saca esa.
  const anterior = Math.max(...elegidos);
  if (cantidad - 1 - anterior <= paso / 2) elegidos.delete(anterior);
  elegidos.add(cantidad - 1);
  return elegidos;
}

/**
 * Dónde cae el día `indice` de `cantidad` en un gráfico de líneas, en % del ancho: en el centro de su
 * lugar, el mismo donde está su botón (`Lineas`, SPEC-KRILINXI-044). Así el punto y lo que se toca para
 * leerlo son siempre lo mismo.
 */
export function posicionX(indice: number, cantidad: number): number {
  if (cantidad <= 0) return 0;
  return redondear(((indice + 0.5) / cantidad) * 100);
}

/**
 * Dónde cae un valor en un gráfico de líneas, en % del alto **contando desde arriba** (así mide el SVG): el
 * máximo llega a `TOPE_COLUMNA` de alto, con lugar arriba para respirar, y cero cae sobre la línea de base
 * (100). Un día sin cobros se dibuja en cero: la línea baja, no se corta.
 */
export function posicionY(valor: number, maximo: number): number {
  return redondear(100 - largo(valor, maximo, TOPE_COLUMNA));
}

/** El índice del valor más alto (el primero, si hay empate), o -1 si todo es cero. */
export function indiceDelMayor(valores: readonly number[]): number {
  let mayor = -1;
  valores.forEach((v, i) => {
    if (v > 0 && (mayor === -1 || v > (valores[mayor] ?? 0))) mayor = i;
  });
  return mayor;
}

/**
 * Las personas de quien más ropa recibió a quien menos; a igual cantidad, en el orden en que
 * llegaron. Devuelve una copia: la lista de abajo del gráfico sigue en el orden del servidor.
 */
export function masRecibidasPrimero<T extends { ordenesRecibidas: number }>(filas: readonly T[]): T[] {
  // `sort` es estable desde ES2019: los empates conservan su orden.
  return [...filas].sort((a, b) => b.ordenesRecibidas - a.ordenesRecibidas);
}

/** Si hay algo que dibujar: un gráfico de puros ceros es un gráfico vacío. */
export function hayDatos(valores: readonly number[]): boolean {
  return valores.some((v) => v > 0);
}

/** `42.857142` → `"42.86%"`: lo que va en el atributo del SVG. */
export function porciento(n: number): string {
  return `${redondear(n)}%`;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
