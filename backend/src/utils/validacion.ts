// Validación de la entrada — creada en SPEC-ALE186-003.
//
// Todo lo que llega en `req.body` o en `req.params` lo escribió un cliente, así
// que entra como `unknown` y sale de acá con un tipo que ya se puede usar o no
// sale. Los controllers de clientes, órdenes, pagos y entregas validan con
// estas mismas piezas: si cada uno escribiera las suyas, cada uno aceptaría
// cosas ligeramente distintas.

import { parse, type Centavos } from './money.js';

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

// ------------------------------------------------------------------
//  Montos y fechas — SPEC-ALE186-004
// ------------------------------------------------------------------

/**
 * Un monto recibido en el cuerpo, en centavos; `null` si no es un monto.
 *
 * Acepta `"12.50"` y también `12.5`: PowerSync sube lo que hay en la columna
 * local, y según cómo la haya escrito la pantalla puede llegar de las dos
 * formas. Lo que no acepta es nada con más de dos decimales, y eso incluye un
 * float contaminado (`0.30000000000000004`): ver `utils/money.ts`.
 *
 * El signo no se decide acá. Un precio puede ser cero y un pago no (CLAUDE.md,
 * sección 3), así que cada controller pone su propio mínimo.
 */
export function montoEnCentavos(valor: unknown): Centavos | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  try {
    return parse(valor);
  } catch {
    return null;
  }
}

/**
 * El monto más alto que entra en una columna NUMERIC(10,2): 99.999.999,99.
 *
 * Pasarse no es un 400 para Postgres: es un error de desbordamiento que acabaría
 * en 500, así que cada controller lo corta antes — SPEC-ALE186-005. (El de
 * órdenes tiene todavía su propia copia, `PRECIO_MAXIMO`.)
 */
export const MONTO_MAXIMO: Centavos = 9_999_999_999;

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Una fecha de calendario `YYYY-MM-DD` que existe de verdad.
 *
 * El formato solo no alcanza: `2026-02-30` lo cumple, y Postgres lo rechazaría
 * con un error que acabaría en 500. Se arma la fecha en UTC y se comprueba que
 * no se haya "corrido" al mes siguiente, que es lo que hace `Date` con un día
 * que no existe.
 */
export function esFechaCalendario(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const partes = FORMATO_FECHA.exec(valor);
  if (partes === null) return false;

  const [anio, mes, dia] = partes.slice(1).map(Number) as [number, number, number];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

// ISO 8601 con zona obligatoria: `Z` o `±hh:mm` al final.
const FORMATO_INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Un instante ISO 8601 que dice en qué zona horaria está.
 *
 * La zona es obligatoria porque las columnas son `TIMESTAMP` sin zona, y
 * Postgres, al guardar en una de ellas un texto que trae zona, la DESCARTA sin
 * avisar. `2026-09-30T14:00:00-04:00` quedaría guardado como 14:00, cuatro horas
 * corrido respecto de un `NOW()`. Con la zona explícita, el model lo pasa por
 * `timestamptz` y lo guarda en la misma hora de referencia que `NOW()`. Un texto
 * sin zona no se puede interpretar sin adivinar, así que no se acepta.
 *
 * Es lo que produce `new Date().toISOString()` en el dispositivo.
 */
export function esInstanteConZona(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_INSTANTE.test(valor) && !Number.isNaN(Date.parse(valor));
}

// ------------------------------------------------------------------
//  Textos con tope y contraseñas — SPEC-ALE186-009
// ------------------------------------------------------------------

/**
 * Un texto con contenido que entra en una columna `VARCHAR(max)`; `null` si
 * está vacío o se pasa.
 *
 * Pasarse no es un 400 para Postgres: es el error 22001 (value too long), que
 * el manejador central convertiría en un 500. Se corta antes, con un mensaje.
 */
export function textoHasta(valor: unknown, max: number): string | null {
  const texto = textoConContenido(valor);
  return texto !== null && texto.length <= max ? texto : null;
}

/**
 * El largo mínimo de una contraseña. Es el mismo 8 que exige la semilla para la
 * del primer admin (`db/seed.ts`): una cuenta creada desde la API no puede
 * quedar más débil que esa.
 */
export const LARGO_MINIMO_CONTRASENA = 8;

/**
 * El máximo, en BYTES. bcrypt solo mira los primeros 72 bytes y descarta el
 * resto sin avisar: dos contraseñas largas que empiezan igual serían la misma.
 * Mejor decirlo al crearla que descubrirlo cuando entra cualquiera.
 */
export const BYTES_MAXIMOS_CONTRASENA = 72;

/** Una contraseña que cumple el mínimo y el máximo; `null` si no. No se recorta. */
export function contrasenaValida(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  if (valor.length < LARGO_MINIMO_CONTRASENA) return null;
  if (Buffer.byteLength(valor, 'utf8') > BYTES_MAXIMOS_CONTRASENA) return null;
  return valor;
}
