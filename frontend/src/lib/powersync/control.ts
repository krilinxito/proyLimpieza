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
import { TABLAS, TABLAS_SOLO_LOCALES } from './schema';

const TODAS_LAS_TABLAS = [...Object.keys(TABLAS), ...Object.keys(TABLAS_SOLO_LOCALES)];

export type Fila = Record<string, unknown>;

/** Cómo va la subida, para el aviso de conexión — SPEC-KRILINXI-007. */
export type EstadoSubida = {
  /** Si hay conexión con el servicio de sincronización, no solo wifi. */
  conectado: boolean;
  /** Cambios escritos en el dispositivo que todavía no llegaron al servidor. */
  pendientes: number;
  /** Cambios que el servidor rechazó y esperan que alguien los corrija. */
  paraCorregir: number;
};

export type BaseLocal = {
  consultar: (sql: string, parametros?: unknown[]) => Promise<Fila[]>;
  ejecutar: (sql: string, parametros?: unknown[]) => Promise<void>;
  /**
   * Avisa el estado de la subida ahora y cada vez que cambia (se escribe algo, se sube, se
   * corta la conexión). Devuelve la función que deja de avisar, lista para un `useEffect`.
   */
  observarEstado: (alCambiar: (estado: EstadoSubida) => void) => () => void;
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
  /** Corta la sincronización y deja los datos: la cola sigue ahí para la próxima sesión. */
  desconectar: () => Promise<void>;
  /** Si queda algo escrito en el dispositivo que todavía no subió. */
  hayCambiosSinSubir: () => Promise<boolean>;
};

export function envolver(db: CommonPowerSyncDatabase, url: string): ControlBaseLocal {
  return {
    base: {
      consultar: (sql, parametros = []) => db.getAll<Fila>(sql, parametros),
      ejecutar: async (sql, parametros = []) => {
        await db.execute(sql, parametros);
      },
      observarEstado: (alCambiar) => observarEstado(db, alCambiar),
    },
    conectar: (obtenerToken) => db.connect(crearConector(url, obtenerToken)),
    desconectarYBorrar: () => db.disconnectAndClear(),
    desconectar: () => db.disconnect(),
    hayCambiosSinSubir: async () => (await db.getUploadQueueStats()).count > 0,
  };
}

/**
 * El estado de la subida, recalculado cuando cambia algo — SPEC-KRILINXI-007.
 *
 * Dos fuentes: `statusChanged` (se conectó, se cortó, empezó o terminó de subir) y
 * `onChange` sobre todas las tablas del schema y la de la cola (se escribió algo, se subió,
 * se guardó un registro para corregir). `onChange` necesita la lista: sin tablas no avisa.
 */
function observarEstado(db: CommonPowerSyncDatabase, alCambiar: (estado: EstadoSubida) => void): () => void {
  let vigente = true;

  async function calcular() {
    const [cola, filas] = await Promise.all([
      db.getUploadQueueStats(),
      db.getAll<{ n: number }>('SELECT count(*) AS n FROM para_corregir'),
    ]);
    if (!vigente) return;
    alCambiar({ conectado: db.currentStatus.connected, pendientes: cola.count, paraCorregir: Number(filas[0]?.n ?? 0) });
  }

  const recalcular = () => {
    calcular().catch((error: unknown) => {
      // Si ya nadie escucha (la pantalla se cerró, o la base se cerró al salir), no es un error.
      if (vigente) console.error('No se pudo leer el estado de la subida.', error);
    });
  };

  recalcular();
  const dejarDeEscucharEstado = db.registerListener({ statusChanged: recalcular });
  // `ps_crud` es la tabla interna donde PowerSync guarda la cola. Sin ella, el contador no se
  // entera cuando la subida la vacía y el aviso seguiría diciendo "3 registros se guardarán…"
  // después de guardarlos (lo comprueba control.test.ts).
  const dejarDeEscucharCambios = db.onChange(
    { onChange: recalcular },
    { tables: [...TODAS_LAS_TABLAS, 'ps_crud'], throttleMs: 100 },
  );

  return () => {
    vigente = false;
    dejarDeEscucharEstado();
    dejarDeEscucharCambios();
  };
}
