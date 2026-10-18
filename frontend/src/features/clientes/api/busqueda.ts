/**
 * Cómo se encuentra a un cliente por lo que se escribe — SPEC-KRILINXI-032.
 *
 * Cada palabra escrita tiene que aparecer en el cliente, en cualquiera de sus datos:
 *  - en el nombre, sin importar tildes ni mayúsculas ("jose qui" → "José Quispe");
 *  - en el teléfono, si la palabra son dígitos (con la misma normalización que el backend:
 *    "7012-3456" busca "70123456");
 *  - en el carnet.
 *
 * Así "rosa 7012" encuentra a la Rosa cuyo teléfono tiene 7012, y no a todas las Rosas.
 *
 * Arma el pedazo de SQL y sus parámetros; no consulta nada. Lo usan la búsqueda de clientes y la
 * de ropa (`features/ordenes/api/ropaLocal.ts`), que encuentra una boleta por su cliente: la
 * regla es una sola. Las columnas las pone quien llama (salen del código, nunca del texto).
 */
import { escaparLike, plegarSql, terminos } from '../../../lib/texto';
import { normalizarTelefono } from '../telefono';

export type ColumnasCliente = { nombre: string; telefono: string; carnet: string };

export type CondicionDeBusqueda = {
  /** Para el WHERE: todas las palabras tienen que coincidir. */
  donde: string;
  parametros: unknown[];
  /** Para el ORDER BY: primero los que empiezan con lo escrito, después el resto. */
  orden: string;
  parametrosOrden: unknown[];
};

/** Los dígitos de una palabra que es un número de teléfono (o parte); '' si tiene letras. */
function digitosDe(termino: string): string {
  return /\p{L}/u.test(termino) ? '' : normalizarTelefono(termino);
}

export function condicionCliente(texto: string, columnas: ColumnasCliente): CondicionDeBusqueda | null {
  const palabras = terminos(texto);
  if (palabras.length === 0) return null;

  const nombre = plegarSql(columnas.nombre);
  const carnet = plegarSql(columnas.carnet);
  const condiciones: string[] = [];
  const parametros: unknown[] = [];

  for (const palabra of palabras) {
    const comoTexto = `%${escaparLike(palabra)}%`;
    const digitos = digitosDe(palabra);
    condiciones.push(
      `(${nombre} LIKE ? ESCAPE '\\' OR (? <> '' AND ${columnas.telefono} LIKE ? ESCAPE '\\') OR ${carnet} LIKE ? ESCAPE '\\')`,
    );
    parametros.push(comoTexto, digitos, `%${escaparLike(digitos)}%`, comoTexto);
  }

  // El orden mira la primera palabra: "ro" pone a "Rosa" (empieza así) antes que a "Pedro"
  // (la tiene en el medio), y a "Ana Rojas" (una palabra empieza así) en el medio.
  const [primera = ''] = palabras;
  const digitos = digitosDe(primera);
  return {
    donde: condiciones.join(' AND '),
    parametros,
    orden: `CASE
        WHEN ${nombre} LIKE ? ESCAPE '\\' THEN 0
        WHEN ? <> '' AND ${columnas.telefono} LIKE ? ESCAPE '\\' THEN 0
        WHEN ${nombre} LIKE ? ESCAPE '\\' THEN 1
        ELSE 2 END`,
    parametrosOrden: [`${escaparLike(primera)}%`, digitos, `${escaparLike(digitos)}%`, `% ${escaparLike(primera)}%`],
  };
}
