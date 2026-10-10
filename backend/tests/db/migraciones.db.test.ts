import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CARPETA_DE_MIGRACIONES,
  CarpetaInvalidaError,
  MigracionFallidaError,
  chequeoDeArranque,
  migrar,
} from '../../src/db/migraciones.js';
import { baseDescartable, type BaseDescartable } from '../helpers/baseDescartable.js';

// Contra Postgres real (sección 4): lo que importa de un runner de migraciones
// —que una que falla se deshaga entera, que el candado frene a un segundo
// `migrar`, que los datos sobrevivan— solo lo dice la base.
//
// Cada test usa su propia base descartable y su propia carpeta temporal de
// migraciones: crear tablas y escribir la tabla de control sobre la base de
// pruebas compartida ensuciaría a los demás archivos de la suite.

const aLimpiar: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (aLimpiar.length > 0) await aLimpiar.pop()?.();
});

async function base(): Promise<BaseDescartable> {
  const nueva = await baseDescartable();
  aLimpiar.push(() => nueva.borrar());
  return nueva;
}

/** Una carpeta temporal con estos archivos (nombre → SQL). */
async function carpeta(archivos: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'migraciones-'));
  aLimpiar.push(() => rm(dir, { recursive: true, force: true }));
  for (const [nombre, sql] of Object.entries(archivos)) await writeFile(path.join(dir, nombre), sql);
  return dir;
}

async function filas<F extends Record<string, unknown>>(b: BaseDescartable, sql: string): Promise<F[]> {
  const conexion = await b.conectar();
  try {
    return (await conexion.query<F>(sql)).rows;
  } finally {
    await conexion.end();
  }
}

async function migrarEn(b: BaseDescartable, dir: string): Promise<string[]> {
  const conexion = await b.conectar();
  try {
    return await migrar(conexion, dir);
  } finally {
    await conexion.end();
  }
}

describe('Migraciones: aplicar en orden, una sola vez — SPEC-ALE186-019', () => {
  it('aplica las pendientes en orden y las anota; la segunda vez no hace nada', async () => {
    const b = await base();
    const dir = await carpeta({
      '002_agregar_nota.sql': 'ALTER TABLE ejemplo ADD COLUMN nota TEXT;',
      '001_crear_ejemplo.sql': 'CREATE TABLE ejemplo (id INT PRIMARY KEY);',
    });

    expect(await migrarEn(b, dir)).toEqual(['001_crear_ejemplo.sql', '002_agregar_nota.sql']);
    expect(await migrarEn(b, dir)).toEqual([]);
    expect(await filas(b, 'SELECT nombre FROM migraciones_aplicadas ORDER BY nombre')).toEqual([
      { nombre: '001_crear_ejemplo.sql' },
      { nombre: '002_agregar_nota.sql' },
    ]);
  });

  it('sobre una base con datos, agrega una columna sin borrar ninguna fila', async () => {
    const b = await base();
    await migrarEn(b, await carpeta({ '001_crear.sql': "CREATE TABLE ejemplo (id INT PRIMARY KEY, nombre TEXT); INSERT INTO ejemplo VALUES (1, 'Ana'), (2, 'Luis');" }));

    await migrarEn(
      b,
      await carpeta({
        '001_crear.sql': 'SELECT 1;',
        '002_agregar_columna.sql': "ALTER TABLE ejemplo ADD COLUMN sucursal TEXT NOT NULL DEFAULT 'Central';",
      }),
    );

    expect(await filas(b, 'SELECT id, nombre, sucursal FROM ejemplo ORDER BY id')).toEqual([
      { id: 1, nombre: 'Ana', sucursal: 'Central' },
      { id: 2, nombre: 'Luis', sucursal: 'Central' },
    ]);
  });

  it('una que falla se deshace entera: las anteriores quedan, ella y las siguientes no', async () => {
    const b = await base();
    const dir = await carpeta({
      '001_crear.sql': 'CREATE TABLE ejemplo (id INT PRIMARY KEY);',
      // La primera sentencia funciona, la segunda no: tiene que deshacerse también la primera.
      '002_rota.sql': 'CREATE TABLE a_medias (id INT); SELECT * FROM tabla_que_no_existe;',
      '003_siguiente.sql': 'CREATE TABLE despues (id INT);',
    });

    const error = await migrarEn(b, dir).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MigracionFallidaError);
    expect(error).toMatchObject({ archivo: '002_rota.sql', detalle: expect.stringContaining('tabla_que_no_existe') });
    expect(await filas(b, 'SELECT nombre FROM migraciones_aplicadas')).toEqual([{ nombre: '001_crear.sql' }]);
    expect(await filas(b, "SELECT to_regclass('a_medias') IS NULL AS sin_a_medias, to_regclass('despues') IS NULL AS sin_despues")).toEqual([
      { sin_a_medias: true, sin_despues: true },
    ]);
  });

  it('dos migrar a la vez: el segundo espera al primero y no aplica nada dos veces', async () => {
    const b = await base();
    const dir = await carpeta({
      // Tarda medio segundo: el segundo `migrar` llega mientras el primero la aplica.
      '001_lenta.sql': 'SELECT pg_sleep(0.5); CREATE TABLE ejemplo (id INT PRIMARY KEY);',
    });

    const [uno, otro] = await Promise.all([migrarEn(b, dir), migrarEn(b, dir)]);

    // Uno la aplicó; el otro, al conseguir el candado, ya no la encontró pendiente.
    expect([...uno, ...otro]).toEqual(['001_lenta.sql']);
    expect(await filas(b, 'SELECT count(*)::int AS n FROM migraciones_aplicadas')).toEqual([{ n: 1 }]);
  });

  it('con un nombre fuera de formato no aplica ninguna, ni siquiera las que estaban bien', async () => {
    const b = await base();
    const dir = await carpeta({
      '001_bien.sql': 'CREATE TABLE ejemplo (id INT);',
      '2_mal.sql': 'CREATE TABLE otra (id INT);',
    });

    await expect(migrarEn(b, dir)).rejects.toBeInstanceOf(CarpetaInvalidaError);
    expect(await filas(b, "SELECT to_regclass('ejemplo') IS NULL AS sin_tabla")).toEqual([{ sin_tabla: true }]);
  });
});

describe('Migraciones: el arranque y la línea base — SPEC-ALE186-019', () => {
  it('el chequeo del servidor dice cuántas faltan en una base sin tabla de control, y nada cuando están todas', async () => {
    const b = await base();
    const dir = await carpeta({ '001_crear.sql': 'CREATE TABLE ejemplo (id INT);', '002_otra.sql': 'CREATE TABLE otra (id INT);' });
    const conexion = await b.conectar();
    try {
      expect(await chequeoDeArranque(conexion, dir)).toMatch(/^Faltan 2 migraciones .*npm run migrar --workspace backend/);
      await migrar(conexion, dir);
      expect(await chequeoDeArranque(conexion, dir)).toBeNull();
    } finally {
      await conexion.end();
    }
  });

  it('las migraciones de verdad se aplican limpias sobre la línea base', async () => {
    // Es lo que pasa en una base recién creada por Docker: la línea base primero,
    // y después todo lo de backend/migraciones/.
    const b = await baseDescartable({ conLineaBase: true });
    aLimpiar.push(() => b.borrar());
    const conexion = await b.conectar();
    try {
      await migrar(conexion, CARPETA_DE_MIGRACIONES);
      expect(await chequeoDeArranque(conexion, CARPETA_DE_MIGRACIONES)).toBeNull();
    } finally {
      await conexion.end();
    }
  });
});
