/**
 * La capa de acceso a la base local: lo único que el resto de la app ve de PowerSync.
 *
 * Envuelve una base de PowerSync, venga del SDK web (el navegador) o del de Node (los
 * tests), y la expone con dos piezas:
 *
 *  - `base`: consultar y escribir con SQL. Es lo que usan las features.
 *  - `conectar` / `desconectarYBorrar`: el ciclo de vida, que maneja la sesión.
 *
 * Las filas salen como `Record<string, unknown>`: SQLite no garantiza tipos, así que cada
 * feature estrecha lo que lee (ver `lib/dominio`) en vez de creerle a un genérico.
 */
import type { CommonPowerSyncDatabase } from '@powersync/common';
import { crearConector } from './conector';

export type Fila = Record<string, unknown>;

export type BaseLocal = {
  consultar: (sql: string, parametros?: unknown[]) => Promise<Fila[]>;
  ejecutar: (sql: string, parametros?: unknown[]) => Promise<void>;
};

export type ControlBaseLocal = {
  base: BaseLocal;
  /**
   * Arranca la sincronización. `obtenerToken` se consulta cada vez que PowerSync se
   * conecta, así usa siempre el token vigente de la sesión.
   */
  conectar: (obtenerToken: () => string | null) => Promise<void>;
  /** Corta la sincronización y borra todos los datos del dispositivo (CLAUDE.md §6). */
  desconectarYBorrar: () => Promise<void>;
};

export function envolver(db: CommonPowerSyncDatabase, url: string): ControlBaseLocal {
  return {
    base: {
      consultar: (sql, parametros = []) => db.getAll<Fila>(sql, parametros),
      ejecutar: async (sql, parametros = []) => {
        await db.execute(sql, parametros);
      },
    },
    conectar: (obtenerToken) => db.connect(crearConector(url, obtenerToken)),
    desconectarYBorrar: () => db.disconnectAndClear(),
  };
}
