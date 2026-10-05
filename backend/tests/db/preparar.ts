// Recrea la base de pruebas antes de la suite de integración — SPEC-ALE186-007.
//
// Es un "global setup" de Vitest: corre UNA vez, antes de cualquier test, en el
// proceso principal (no en los workers que ejecutan los tests). Borra la base
// `<nombre>_test`, la vuelve a crear y le carga `context/lavanderia_schema.sql`.
//
// Recrearla en cada corrida es lo que hace que:
//   - lo que dejó una corrida anterior no afecte a la siguiente;
//   - los tests prueben siempre contra el schema actual, sin `docker compose down -v`.
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { RUTA_DEL_SCHEMA, entornoDePrueba } from './entorno.js';

/** Algo legible del error de conexión. */
function describir(causa: unknown): string {
  if (!(causa instanceof Error)) return String(causa);
  // Con la conexión rechazada, Node lanza un AggregateError con `message` vacío:
  // lo útil (ECONNREFUSED, ETIMEDOUT…) está en `code`.
  const codigo = 'code' in causa && typeof causa.code === 'string' ? causa.code : '';
  return [codigo, causa.message].filter((parte) => parte !== '').join(': ') || causa.name;
}

function sinConexion(causa: unknown): Error {
  const detalle = describir(causa);
  return new Error(
    'No se pudo conectar a Postgres para los tests contra la base real.\n' +
      '¿Está levantado Docker? Corré `docker compose up -d postgres` desde la raíz y volvé a intentarlo.\n' +
      `(Detalle: ${detalle})`,
  );
}

/**
 * Lo que hace el global setup, con el entorno como argumento para poder
 * probarlo (`entorno.db.test.ts`) sin tocar `process.env`.
 */
export async function prepararBase(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { nombre, urlPrueba, urlMantenimiento } = entornoDePrueba(env);

  // Una base no se puede borrar mientras uno está conectado a ella, así que esto
  // se hace desde `postgres`, la base de mantenimiento que trae todo servidor.
  const mantenimiento = new pg.Client({ connectionString: urlMantenimiento, connectionTimeoutMillis: 5000 });
  try {
    await mantenimiento.connect();
  } catch (error) {
    throw sinConexion(error);
  }

  try {
    // WITH (FORCE) corta las conexiones que hayan quedado abiertas de una
    // corrida interrumpida; sin eso, el DROP fallaría con "being accessed".
    await mantenimiento.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
    await mantenimiento.query(`CREATE DATABASE "${nombre}"`);
  } finally {
    await mantenimiento.end();
  }

  // Un `query` sin parámetros acepta varias sentencias seguidas: el schema
  // entero viaja de una vez, igual que cuando Docker lo carga al arrancar.
  const prueba = new pg.Client({ connectionString: urlPrueba });
  await prueba.connect();
  try {
    await prueba.query(await readFile(RUTA_DEL_SCHEMA, 'utf8'));
  } finally {
    await prueba.end();
  }
}

// Vitest llama al global setup pasándole su propio contexto como argumento, así
// que la función por defecto no recibe nada y usa el entorno real.
export default async function preparar(): Promise<void> {
  await prepararBase();
}
