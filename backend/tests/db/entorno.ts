// A qué base se conectan los tests de integración — SPEC-ALE186-007.
//
// Es el ÚNICO lugar que lo decide. Parte de la DATABASE_URL del `.env` de la
// raíz (la misma que usa `npm run dev`) y le cambia el nombre de la base por
// `<nombre>_test`: mismo servidor, misma contraseña, otra base. Así no hace
// falta una variable nueva en el `.env`, y la base de desarrollo no se toca.
//
// Lo usan `vitest.db.config.ts` (para pasarle la URL a los tests) y
// `preparar.ts` (para recrear la base antes de empezar).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const RAIZ_DEL_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

dotenv.config({ path: path.join(RAIZ_DEL_REPO, '.env'), quiet: true });

/** El schema que se carga en la base de pruebas: el mismo que usa Docker. */
export const RUTA_DEL_SCHEMA = path.join(RAIZ_DEL_REPO, 'context', 'lavanderia_schema.sql');

// Letras, números y guion bajo. El nombre de una base no puede ir como `$1`
// —los parámetros son para valores, no para nombres—, así que va escrito dentro
// del SQL de `DROP DATABASE`. Por eso se valida tan estricto: es la única forma
// de que ese texto no pueda colar nada más que un nombre.
const NOMBRE_SEGURO = /^[a-z0-9_]+$/i;

export interface EntornoDePrueba {
  /** La base de pruebas, `<nombre>_test`. */
  nombre: string;
  /** Conexión a la base de pruebas: la que usan los tests. */
  urlPrueba: string;
  /** Conexión a `postgres`, la base de mantenimiento: desde ahí se borra y se crea la de pruebas. */
  urlMantenimiento: string;
}

export function entornoDePrueba(env: NodeJS.ProcessEnv = process.env): EntornoDePrueba {
  const original = env.DATABASE_URL?.trim();
  if (!original) {
    throw new Error(
      'Falta DATABASE_URL en el .env de la raíz. Los tests contra la base real la usan para ' +
        'saber a qué Postgres conectarse (la base de pruebas es esa misma, con "_test" al final).',
    );
  }

  const url = new URL(original);
  const base = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const nombre = `${base}_test`;

  if (!NOMBRE_SEGURO.test(base)) {
    throw new Error(`El nombre de la base "${base}" tiene caracteres que los tests no aceptan.`);
  }

  const urlPrueba = new URL(url);
  urlPrueba.pathname = `/${nombre}`;
  const urlMantenimiento = new URL(url);
  urlMantenimiento.pathname = '/postgres';

  return { nombre, urlPrueba: urlPrueba.toString(), urlMantenimiento: urlMantenimiento.toString() };
}
