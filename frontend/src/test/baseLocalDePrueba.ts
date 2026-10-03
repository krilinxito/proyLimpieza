/**
 * Doble de la base local para los tests — SPEC-KRILINXI-004
 *
 * `baseLocalDePrueba()` es **la base de PowerSync de verdad**, con el mismo schema y la
 * misma capa de acceso (`envolver`) que el navegador. Lo único que cambia es el driver:
 * SQLite nativo de Node (`@powersync/node` + better-sqlite3) en vez de WASM, porque el
 * SDK web no corre en jsdom. Las consultas son SQL real y la cola de subida es la real.
 * Usala cuando lo que probás es SQL o la cola:
 *
 *     const { control, db } = await baseLocalDePrueba();
 *     await control.base.ejecutar('INSERT INTO clientes (id, nombre) VALUES (uuid(), ?)', ['Rosa']);
 *     expect(await control.base.consultar('SELECT nombre FROM clientes')).toEqual([{ nombre: 'Rosa' }]);
 *     expect((await db.getCrudBatch())?.crud).toHaveLength(1);   // la cola, sin pasar por la capa
 *
 * Cada llamada crea una base nueva en una carpeta temporal y la borra al terminar el test.
 *
 * Para una pantalla que no lee datos alcanza con `controlFalso()` (test/controlFalso.ts),
 * que es el que usa `renderEnRuta` por defecto.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PowerSyncDatabase } from '@powersync/node';
import { onTestFinished } from 'vitest';
import { envolver } from '../lib/powersync/control';
import { SCHEMA_LOCAL } from '../lib/powersync/schema';

export async function baseLocalDePrueba() {
  const carpeta = mkdtempSync(join(tmpdir(), 'lavanderia-test-'));
  const db = new PowerSyncDatabase({
    schema: SCHEMA_LOCAL,
    database: { dbFilename: 'prueba.sqlite', dbLocation: carpeta },
  });
  await db.init();

  onTestFinished(async () => {
    await db.close();
    rmSync(carpeta, { recursive: true, force: true });
  });

  // Una URL que no existe: si algún test conectara de verdad, que falle en vez de
  // hablarle a un PowerSync de desarrollo que alguien tenga levantado.
  return { control: envolver(db, 'http://powersync.invalid'), db };
}

