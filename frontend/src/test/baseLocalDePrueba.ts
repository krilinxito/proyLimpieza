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
 * Para partir de datos que "ya estaban en el servidor" —el cliente que el mostrador tiene
 * que encontrar— está `sembrar` (SPEC-KRILINXI-005). Las filas quedan en la base pero NO
 * en la cola, como si hubieran bajado por la sincronización:
 *
 *     const { control, sembrar } = await baseLocalDePrueba();
 *     await sembrar('clientes', [{ id: randomUUID(), nombre: 'Rosa', telefono: '70123456' }]);
 *
 * Sembrá antes de escribir nada: si la cola ya tiene algo, `sembrar` falla en vez de darlo
 * por subido sin que el test se entere.
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
import { SCHEMA_LOCAL, TABLAS } from '../lib/powersync/schema';

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
  async function sembrar(tabla: keyof typeof TABLAS, filas: Record<string, unknown>[]): Promise<void> {
    if (await db.getCrudBatch()) {
      throw new Error('sembrar() va antes de cualquier escritura: la cola de subida ya tiene cambios.');
    }
    for (const fila of filas) {
      const columnas = Object.keys(fila);
      await db.execute(
        `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
        Object.values(fila),
      );
    }
    // Lo que acaba de entrar en la cola se da por subido: es lo que hace PowerSync cuando el
    // servidor acepta un cambio. La fila queda, la cola se vacía.
    for (let lote = await db.getCrudBatch(1000); lote; lote = await db.getCrudBatch(1000)) {
      await lote.complete();
    }
  }

  return { control: envolver(db, 'http://powersync.invalid'), db, sembrar };
}

