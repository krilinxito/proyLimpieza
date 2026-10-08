// La hora del servidor — SPEC-ALE186-015.
//
// No es el model de ninguna tabla: es la pregunta "¿qué hora es?", hecha a
// Postgres. Vive en `models/` porque es una consulta, y un controller no escribe
// SQL (CLAUDE.md, sección 5).
//
// Por qué Postgres y no `new Date()` de Node: la regla que rechaza fechas en el
// futuro (SPEC-ALE186-014) compara contra `now()` de Postgres. La tablet usa
// esta hora para medir el desfase de su reloj, así que tiene que calibrarse
// contra el MISMO reloj que después la juzga. En Docker, la base corre en otra
// máquina virtual y su reloj puede no coincidir con el del proceso de Node.
import { pool } from '../db/pool.js';

/** La hora de Postgres, como ISO 8601 en UTC (`2026-10-08T14:05:03.123Z`). */
export async function ahora(): Promise<string> {
  const { rows } = await pool.query<{ ahora: Date }>('SELECT now() AS ahora');
  const fila = rows[0];
  if (fila === undefined) throw new Error('SELECT now() no devolvió ninguna fila.');
  return fila.ahora.toISOString();
}
