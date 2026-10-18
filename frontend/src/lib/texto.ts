/**
 * Buscar sin que importen las tildes ni las mayúsculas — SPEC-KRILINXI-032.
 *
 * "jose" tiene que encontrar a "José", y "nunez" a "Núñez": en el mostrador nadie se detiene a
 * poner tildes. Para eso, lo que se escribe y lo que está guardado se "pliegan" a la misma forma
 * (minúsculas, sin tildes ni diéresis, la ñ como n) y se comparan así.
 *
 * Son dos funciones que tienen que hacer **exactamente lo mismo**, una en JavaScript (para lo
 * que escribe la persona) y otra en SQL (para la columna de la base). SQLite no sabe quitar
 * tildes, y su `lower()` solo pasa a minúsculas las letras sin tilde (`lower('Á')` sigue siendo
 * `Á`): por eso el SQL reemplaza a mano cada letra con tilde, en mayúscula y en minúscula. El
 * test (`texto.test.ts`) pasa los mismos nombres por las dos y exige el mismo resultado.
 */

/** Cada letra con tilde (en las dos cajas) y su versión plegada. */
const PLIEGUES: readonly [desde: string, hacia: string][] = [
  ['á', 'a'],
  ['é', 'e'],
  ['í', 'i'],
  ['ó', 'o'],
  ['ú', 'u'],
  ['ü', 'u'],
  ['ñ', 'n'],
  ['Á', 'a'],
  ['É', 'e'],
  ['Í', 'i'],
  ['Ó', 'o'],
  ['Ú', 'u'],
  ['Ü', 'u'],
  ['Ñ', 'n'],
];

/** El texto plegado: "José Núñez" → "jose nunez". Para comparar, nunca para mostrar. */
export function plegar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * La misma regla en SQL, sobre una columna: `plegarSql('c.nombre')` devuelve una expresión que
 * vale "jose nunez" para la fila de "José Núñez". La columna sale siempre del código, nunca de lo
 * que escribió alguien (CLAUDE.md §5: nada de valores concatenados en una consulta).
 */
export function plegarSql(columna: string): string {
  return PLIEGUES.reduce((sql, [desde, hacia]) => `replace(${sql}, '${desde}', '${hacia}')`, `lower(${columna})`);
}

/**
 * Prepara un término para un `LIKE ... ESCAPE '\'`: un `%` o un `_` escritos por la persona se
 * buscan tal cual, no como comodines.
 */
export function escaparLike(termino: string): string {
  return termino.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Si lo escrito alcanza para buscar: al menos 2 letras o 3 dígitos. Con menos, cualquier cosa
 * coincide y la lista no ayuda a nadie.
 */
export function alcanzaParaBuscar(texto: string): boolean {
  const letras = plegar(texto).match(/\p{L}/gu)?.length ?? 0;
  const digitos = texto.match(/\d/g)?.length ?? 0;
  return letras >= 2 || digitos >= 3;
}

/** Las palabras de lo escrito, ya plegadas: "  José  qui " → ["jose", "qui"]. */
export function terminos(texto: string): string[] {
  return plegar(texto).split(/\s+/).filter(Boolean);
}

/**
 * Lo que devuelve una búsqueda mientras se escribe: los primeros resultados, y si quedaron más
 * afuera. No se cuentan todos: alcanza con saber que conviene escribir un poco más.
 */
export type ResultadosDeBusqueda<T> = { resultados: T[]; hayMas: boolean };
