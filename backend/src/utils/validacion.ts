// Validación de la entrada — creada en SPEC-ALE186-003.
//
// Todo lo que llega en `req.body` o en `req.params` lo escribió un cliente, así
// que entra como `unknown` y sale de acá con un tipo que ya se puede usar o no
// sale. Los controllers de clientes, órdenes, pagos y entregas validan con
// estas mismas piezas: si cada uno escribiera las suyas, cada uno aceptaría
// cosas ligeramente distintas.

// Forma 8-4-4-4-12 en hexadecimal. No se exige versión: el dispositivo usa
// `crypto.randomUUID()` (v4), pero lo que importa acá es que Postgres lo acepte
// en una columna UUID. Un id mal formado que llegara a la base no sería un 400:
// sería un error de Postgres, y el manejador central lo convertiría en un 500.
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}

/**
 * El cuerpo de una petición como objeto, o un objeto vacío.
 *
 * `express.json()` deja en `req.body` lo que haya mandado el cliente: un
 * objeto, un array, un número, o `undefined` si no mandó nada. Leer campos de
 * algo que no es un objeto revienta; así, un cuerpo raro se comporta igual que
 * un cuerpo vacío y termina en un 400 con mensaje, no en un 500.
 */
export function comoObjeto(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

/** Un texto con contenido, ya sin espacios en los bordes; `null` si no lo hay. */
export function textoConContenido(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const recortado = valor.trim();
  return recortado === '' ? null : recortado;
}

/**
 * El teléfono con solo sus dígitos.
 *
 * El teléfono identifica al cliente (CLAUDE.md, sección 3) y es único. Sin
 * normalizar, `7012-3456` y `70123456` serían dos teléfonos distintos para la
 * base, y la unicidad se burlaría con un guion: el mismo cliente aparecería dos
 * veces y sus órdenes quedarían repartidas entre las dos fichas.
 *
 * El frontend tiene que normalizar igual al buscar en su base local, o no
 * encontraría a un cliente guardado sin el guion que escribió el empleado.
 */
export function normalizarTelefono(valor: string): string {
  return valor.replace(/\D/g, '');
}
