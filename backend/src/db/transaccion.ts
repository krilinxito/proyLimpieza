// Una transacción con una conexión prestada del pool — creado en SPEC-KRILINXI-071.
//
// Casi todo el backend escribe en UNA sentencia (la escritura y su auditoría encadenadas con un CTE, CLAUDE.md §6),
// y una sentencia ya es atómica sola. Una transacción hace falta cuando no alcanza con una: cuando hay que leer y
// decidir en TypeScript entre dos escrituras, o cuando son varias filas de varias tablas. Corregir una boleta es las
// dos cosas (`services/correccionOrden.ts`).
//
// Todas las sentencias de una transacción tienen que ir por la MISMA conexión: el pool reparte cada `pool.query` a la
// que esté libre, y un `BEGIN` en una y un `UPDATE` en otra no tienen nada que ver entre sí. Por eso `fn` recibe la
// conexión, y los models que participan la reciben como parámetro (`Ejecutor`).
//
//   const resultado = await enTransaccion(async (conexion) => {
//     await conexion.query('SELECT … FOR UPDATE', […]);
//     …
//     return algo;
//   });
//
// Si `fn` lanza, se deshace todo (ROLLBACK) y el error sigue su camino. Si devuelve, se confirma (COMMIT). Una regla
// que rechaza sin lanzar tiene que decidirse ANTES de la primera escritura: lo que se devuelve se confirma.
import type pg from 'pg';
import { pool } from './pool.js';

/** Con qué se ejecuta una consulta: el pool, o la conexión de una transacción. Los dos tienen el mismo `query`. */
export type Ejecutor = Pick<pg.PoolClient, 'query'>;

export async function enTransaccion<T>(fn: (conexion: pg.PoolClient) => Promise<T>): Promise<T> {
  const conexion = await pool.connect();
  try {
    await conexion.query('BEGIN');
    const resultado = await fn(conexion);
    await conexion.query('COMMIT');
    return resultado;
  } catch (error) {
    await conexion.query('ROLLBACK');
    throw error;
  } finally {
    conexion.release();
  }
}
