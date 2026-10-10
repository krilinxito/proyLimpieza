// Una base de Postgres que nace y muere en un test — SPEC-ALE186-019.
//
// Para los tests de migraciones (y los de la spec que use las primeras
// migraciones de verdad). Una migración crea tablas, agrega columnas y escribe
// en la tabla de control: hacerlo sobre la base de pruebas COMPARTIDA ensuciaría
// a los demás archivos de la suite, que corren en paralelo. Esta base es solo
// del test que la pide.
//
//   const base = await baseDescartable();          // vacía, o con la línea base
//   const conexion = await base.conectar();        // un pg.Client propio
//   ...
//   await base.borrar();                           // en el afterAll
//
// Vive en el mismo servidor que la base de pruebas: parte de su DATABASE_URL
// (que `vitest.db.config.ts` ya apunta a `<nombre>_test`) y le cambia el nombre.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { RUTA_DEL_SCHEMA } from '../db/entorno.js';

export interface BaseDescartable {
  url: string;
  /** Una conexión nueva a esta base. Quien la pide la cierra (`end()`). */
  conectar(): Promise<pg.Client>;
  /** La borra, cortando las conexiones que hayan quedado abiertas. */
  borrar(): Promise<void>;
}

function urlCon(nombre: string): string {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/${nombre}`;
  return url.toString();
}

async function enMantenimiento(sql: string): Promise<void> {
  // Una base no se crea ni se borra desde adentro de sí misma: desde `postgres`.
  const mantenimiento = new pg.Client({ connectionString: urlCon('postgres') });
  await mantenimiento.connect();
  try {
    await mantenimiento.query(sql);
  } finally {
    await mantenimiento.end();
  }
}

/**
 * Crea una base nueva con nombre único. Con `conLineaBase`, le carga
 * `context/lavanderia_schema.sql`, como hace Docker la primera vez.
 */
export async function baseDescartable(opciones: { conLineaBase?: boolean } = {}): Promise<BaseDescartable> {
  const actual = decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').pathname.slice(1));
  // Solo letras, números y guion bajo: el nombre va escrito dentro del SQL, porque
  // un nombre de base no puede ir como `$1` (ver `tests/db/entorno.ts`).
  const nombre = `${actual}_d${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  if (!/^[a-z0-9_]+$/i.test(nombre)) throw new Error(`Nombre de base inesperado: ${nombre}`);

  await enMantenimiento(`CREATE DATABASE "${nombre}"`);
  const url = urlCon(nombre);

  const conectar = async () => {
    const conexion = new pg.Client({ connectionString: url });
    await conexion.connect();
    return conexion;
  };

  if (opciones.conLineaBase === true) {
    const conexion = await conectar();
    try {
      await conexion.query(await readFile(RUTA_DEL_SCHEMA, 'utf8'));
    } finally {
      await conexion.end();
    }
  }

  return {
    url,
    conectar,
    borrar: () => enMantenimiento(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`),
  };
}
