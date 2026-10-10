// Migraciones del schema — SPEC-ALE186-019.
//
// Hasta esta spec, la única forma de cambiar el schema era editar
// `context/lavanderia_schema.sql` y correr `docker compose down -v`, que borra la
// base entera. Ahora ese archivo es la LÍNEA BASE, congelada, y cada cambio
// posterior es un archivo `backend/migraciones/NNN_nombre.sql` que se aplica en
// orden sobre la base que ya existe, sin borrar nada.
//
// Este módulo es el runner. No usa el pool de la API: recibe una conexión propia
// (`pg.Client`), porque el bloqueo que impide dos `migrar` a la vez
// (`pg_advisory_lock`) es de la SESIÓN, y un pool reparte las consultas entre
// varias sesiones.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** `backend/migraciones/`: donde viven los archivos de verdad. */
export const CARPETA_DE_MIGRACIONES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migraciones');

/** La tabla donde la base anota qué migraciones ya tiene. */
export const TABLA_DE_CONTROL = 'migraciones_aplicadas';

/**
 * El número del bloqueo de Postgres que usa `migrar`. Cualquier número sirve,
 * mientras sea siempre el mismo: es "el candado de las migraciones" de esta base.
 */
const CANDADO = 20_191_001;

/** `001_agregar_columna_revision.sql`: tres dígitos, guion bajo, minúsculas. */
const FORMATO = /^(\d{3})_[a-z0-9_]+\.sql$/;

export interface Migracion {
  numero: number;
  /** El nombre del archivo, que es lo que se anota en la tabla de control. */
  nombre: string;
  ruta: string;
}

/** Un archivo de la carpeta que no se puede aplicar. Se avisa antes de tocar la base. */
export class CarpetaInvalidaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'CarpetaInvalidaError';
  }
}

/** Una migración falló. Las anteriores quedaron aplicadas; esta y las siguientes, no. */
export class MigracionFallidaError extends Error {
  constructor(
    readonly archivo: string,
    readonly detalle: string,
  ) {
    super(`La migración ${archivo} falló: ${detalle}`);
    this.name = 'MigracionFallidaError';
  }
}

/**
 * Las migraciones de la carpeta, en orden.
 *
 * Solo mira los `.sql` (un README al lado no molesta). Si alguno no sigue el
 * formato, o dos comparten número, no devuelve ninguna: es mejor no aplicar nada
 * que aplicar la mitad en un orden que nadie eligió.
 */
export async function leerMigraciones(carpeta: string): Promise<Migracion[]> {
  const archivos = (await readdir(carpeta)).filter((archivo) => archivo.endsWith('.sql')).sort();

  const migraciones: Migracion[] = [];
  const vistos = new Map<number, string>();
  for (const nombre of archivos) {
    const coincidencia = FORMATO.exec(nombre);
    if (coincidencia === null) {
      throw new CarpetaInvalidaError(
        `"${nombre}" no sigue el formato NNN_nombre.sql (tres dígitos, guion bajo, minúsculas). ` +
          'Renombralo antes de migrar.',
      );
    }
    const numero = Number(coincidencia[1]);
    const otro = vistos.get(numero);
    if (otro !== undefined) {
      throw new CarpetaInvalidaError(
        `"${otro}" y "${nombre}" tienen el mismo número. Cada migración necesita uno propio.`,
      );
    }
    vistos.set(numero, nombre);
    migraciones.push({ numero, nombre, ruta: path.join(carpeta, nombre) });
  }
  return migraciones;
}

/** Algo que puede hacer una consulta: un `pg.Client` o el pool de la API. */
export interface Consultable {
  query<F extends pg.QueryResultRow>(sql: string, valores?: unknown[]): Promise<pg.QueryResult<F>>;
}

/**
 * Los nombres de las migraciones que la base ya tiene. Si la tabla de control no
 * existe todavía —una base creada antes de esta spec—, ninguna.
 *
 * No crea la tabla: lo usa también el chequeo del servidor, que solo lee.
 */
async function yaAplicadas(base: Consultable): Promise<Set<string>> {
  try {
    const { rows } = await base.query<{ nombre: string }>(`SELECT nombre FROM ${TABLA_DE_CONTROL}`);
    return new Set(rows.map((fila) => fila.nombre));
  } catch (error) {
    // 42P01 = undefined_table.
    if (error instanceof pg.DatabaseError && error.code === '42P01') return new Set();
    throw error;
  }
}

/** Las migraciones de la carpeta que esta base todavía no tiene, en orden. */
export async function pendientes(base: Consultable, carpeta: string): Promise<Migracion[]> {
  const [todas, aplicadas] = await Promise.all([leerMigraciones(carpeta), yaAplicadas(base)]);
  return todas.filter((migracion) => !aplicadas.has(migracion.nombre));
}

/**
 * Aplica las pendientes, una por una, y devuelve los nombres de las que aplicó.
 *
 * Cada migración va en su propia transacción JUNTO con su anotación: si el SQL
 * falla, se deshace entero y no queda anotada, así que la próxima vez se vuelve a
 * intentar. Las anteriores ya quedaron confirmadas; las siguientes no se
 * intentan, porque pueden depender de la que falló.
 *
 * Todo esto pasa con el candado tomado (`pg_advisory_lock`). Si otro `migrar`
 * está corriendo sobre la misma base, este espera a que termine, y recién
 * entonces mira qué falta: no aplica nada dos veces.
 */
export async function migrar(conexion: pg.Client, carpeta: string): Promise<string[]> {
  // Primero la carpeta: un nombre mal escrito frena todo antes de tocar la base.
  await leerMigraciones(carpeta);

  await conexion.query('SELECT pg_advisory_lock($1)', [CANDADO]);
  try {
    await conexion.query(
      `CREATE TABLE IF NOT EXISTS ${TABLA_DE_CONTROL} (
         nombre      TEXT        PRIMARY KEY,
         aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );

    const aplicadas: string[] = [];
    for (const migracion of await pendientes(conexion, carpeta)) {
      const sql = await readFile(migracion.ruta, 'utf8');
      try {
        await conexion.query('BEGIN');
        // Sin parámetros, `query` acepta varias sentencias seguidas: el archivo
        // entero viaja de una vez, como cuando Docker carga la línea base.
        await conexion.query(sql);
        await conexion.query(`INSERT INTO ${TABLA_DE_CONTROL} (nombre) VALUES ($1)`, [migracion.nombre]);
        await conexion.query('COMMIT');
      } catch (error) {
        await conexion.query('ROLLBACK');
        throw new MigracionFallidaError(migracion.nombre, error instanceof Error ? error.message : String(error));
      }
      aplicadas.push(migracion.nombre);
    }
    return aplicadas;
  } finally {
    await conexion.query('SELECT pg_advisory_unlock($1)', [CANDADO]);
  }
}

/**
 * El mensaje para el arranque del servidor si faltan migraciones, o `null` si
 * está todo aplicado. El servidor no las aplica solo: en producción, un cambio
 * de schema tiene que ser una decisión, y dos servidores arrancando a la vez no
 * pueden aplicarlas los dos.
 */
export async function chequeoDeArranque(base: Consultable, carpeta: string): Promise<string | null> {
  const faltan = await pendientes(base, carpeta);
  if (faltan.length === 0) return null;
  const cuantas = faltan.length === 1 ? 'Falta 1 migración' : `Faltan ${faltan.length} migraciones`;
  return (
    `${cuantas} en la base (${faltan.map((m) => m.nombre).join(', ')}). ` +
    'Aplicalas con `npm run migrar --workspace backend` y volvé a arrancar.'
  );
}
