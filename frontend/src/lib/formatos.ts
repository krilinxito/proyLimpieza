/**
 * Cómo tienen que verse el número de boleta, el teléfono y el carnet — SPEC-KRILINXI-058.
 *
 * Es **la misma regla** que el backend (`backend/src/utils/formatos.ts`), y tiene que seguir siéndolo: lo que el formulario da
 * por bueno es lo que el servidor acepta. Cada lado tiene su copia (los dos workspaces no comparten código), y las dos se
 * prueban contra la misma tabla de casos, `context/formatos.casos.json`: si una cambia sola, su test falla.
 *
 * Son reglas de forma, no de existencia: que un teléfono tenga 8 números no dice que sea el de alguien. Para escribir se
 * aceptan espacios y guiones (`7012-3456`); el teléfono se guarda sin ellos (`clientes/telefono.ts`).
 */

/** Letras, números y guion, con al menos un número: `001003`, `B-1003`. Sin espacios ni otros signos. */
const BOLETA = /^(?=.*\d)[A-Za-z0-9-]+$/;

/** El número de la cuenta, con su extensión si la tiene (el departamento o un complemento): `1234567`, `1234567 LP`, `1234567-1A`. */
const CARNET = /^\d{4,10}(?:[ -]?(?:[A-Za-z]{1,3}|\d[A-Za-z]))?$/;

export function esNumeroDeBoleta(valor: string): boolean {
  return BOLETA.test(valor.trim());
}

/** Solo números (con espacios o guiones para leerlo mejor), y 7 (fijo) u 8 (celular) de ellos. */
export function esTelefonoValido(valor: string): boolean {
  const texto = valor.trim();
  if (!/^[\d\s-]+$/.test(texto)) return false;
  const numeros = texto.replace(/\D/g, '').length;
  return numeros === 7 || numeros === 8;
}

export function esCarnetValido(valor: string): boolean {
  return CARNET.test(valor.trim());
}
