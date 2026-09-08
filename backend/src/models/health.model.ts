// Model: el único que habla con la base.
//
// Recibe argumentos y devuelve datos. No conoce `req` ni `res`, y por eso se
// puede probar sin levantar un servidor (CLAUDE.md, sección 5).
import { pool } from '../db/pool.js';

/**
 * ¿Responde Postgres?
 *
 * `SELECT 1` es la consulta más barata que existe: no lee ninguna tabla, así
 * que lo único que comprueba es exactamente lo que queremos comprobar — que
 * hay una conexión viva y que la base contesta.
 */
export async function estaDisponible(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
