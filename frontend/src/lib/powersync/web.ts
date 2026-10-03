/**
 * La base local del navegador: SQLite compilado a WASM, guardado en el dispositivo.
 *
 * Este archivo solo se carga con `import()` dinámico (ver `abrirBaseLocal` en `index.ts`):
 * el SDK web necesita workers y WASM, que jsdom no tiene, así que los tests de las
 * pantallas nunca lo tocan. Usan el doble de `test/baseLocalDePrueba.ts`.
 */
import { PowerSyncDatabase } from '@powersync/web';
import { entorno } from '../env';
import { envolver, type ControlBaseLocal } from './control';
import { SCHEMA_LOCAL } from './schema';

// Una sola base por pestaña. Después de `desconectarYBorrar` queda vacía y se puede volver
// a conectar para el siguiente que entre.
let control: Promise<ControlBaseLocal> | null = null;

export function abrir(): Promise<ControlBaseLocal> {
  control ??= (async () => {
    const db = new PowerSyncDatabase({ schema: SCHEMA_LOCAL, database: { dbFilename: 'lavanderia.sqlite' } });
    // Abrir la base no espera a ninguna sincronización: con lo que ya hay guardado, las
    // consultas responden aunque no haya internet (CLAUDE.md §6).
    await db.init();
    return envolver(db, entorno.powersyncUrl);
  })().catch((error: unknown) => {
    // Si falló, que el próximo intento vuelva a probar en vez de heredar el fallo.
    control = null;
    throw error;
  });
  return control;
}
