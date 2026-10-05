// Model de entregas: el único sitio que escribe en la tabla `entregas` — SPEC-ALE186-006.
//
// Mismas reglas de escritura que pagos (SPEC-ALE186-005): id del dispositivo,
// reintento idempotente, y `sucursal_id` copiado de la orden en la misma
// sentencia que inserta. La ropa se retira en la misma sucursal donde se dejó,
// así que la entrega queda siempre con la sucursal de su orden.
//
// Lo nuevo es que registrar una entrega escribe en DOS tablas: la entrega, y la
// orden, que pasa a ENTREGADO. Tienen que ocurrir las dos o ninguna — ver `crear`.
import pg from 'pg';
import { pool } from '../db/pool.js';
import { ESTADOS_CERRADOS, ESTADOS_ORDEN, type TipoRetiro } from '../utils/dominio.js';
import { formatear, type Centavos } from '../utils/money.js';
import { conAuditoria } from './auditoria.model.js';
import * as ordenes from './ordenes.model.js';
import type { Orden } from './ordenes.model.js';

export interface Entrega {
  id: string;
  ordenId: string;
  sucursalId: string;
  fechaEntrega: string;
  tipoRetiro: TipoRetiro;
  retiradoPorNombre: string | null;
  retiradoPorCarnet: string | null;
  usuarioEntregaId: string;
  /** Como lo entrega Postgres: `"45.50"`. Para operar, `money.parse`. */
  precioFinal: string;
}

interface FilaEntrega {
  id: string;
  orden_id: string;
  sucursal_id: string;
  fecha_entrega: string;
  tipo_retiro: TipoRetiro;
  retirado_por_nombre: string | null;
  retirado_por_carnet: string | null;
  usuario_entrega_id: string;
  precio_final: string;
}

function aEntrega(fila: FilaEntrega): Entrega {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    sucursalId: fila.sucursal_id,
    fechaEntrega: fila.fecha_entrega,
    tipoRetiro: fila.tipo_retiro,
    retiradoPorNombre: fila.retirado_por_nombre,
    retiradoPorCarnet: fila.retirado_por_carnet,
    usuarioEntregaId: fila.usuario_entrega_id,
    precioFinal: fila.precio_final,
  };
}

const COLUMNAS =
  'id, orden_id, sucursal_id, fecha_entrega, tipo_retiro, retirado_por_nombre, ' +
  'retirado_por_carnet, usuario_entrega_id, precio_final';

/**
 * Desde qué estados se puede entregar: todos los que no están cerrados.
 *
 * No solo LISTO, a propósito: si el cliente se llevó la ropa y nadie la había
 * marcado lista, rechazar la entrega al sincronizar perdería el registro de algo
 * que ya pasó en el mostrador.
 */
export const ESTADOS_ENTREGABLES = ESTADOS_ORDEN.filter((estado) => !ESTADOS_CERRADOS.includes(estado));

// Nombres de las restricciones del schema (sin nombre explícito, así que son los
// que les pone Postgres). 23505 = unique_violation.
const RESTRICCION_ID = 'entregas_pkey';
const RESTRICCION_UNA_POR_ORDEN = 'entregas_orden_id_key';

function violoUnicidad(error: unknown, restriccion: string): boolean {
  return error instanceof pg.DatabaseError && error.code === '23505' && error.constraint === restriccion;
}

export async function buscarPorId(id: string): Promise<Entrega | null> {
  const { rows } = await pool.query<FilaEntrega>(`SELECT ${COLUMNAS} FROM entregas WHERE id = $1`, [id]);
  const fila = rows[0];
  return fila === undefined ? null : aEntrega(fila);
}

export interface EntregaNueva {
  id: string;
  ordenId: string;
  tipoRetiro: TipoRetiro;
  retiradoPorNombre: string | null;
  retiradoPorCarnet: string | null;
  usuarioEntregaId: string;
  /** `null` = el `precio_total` de la orden. */
  precioFinal: Centavos | null;
  /** ISO 8601 con zona, tal como lo manda el dispositivo; `null` = ahora. */
  fechaEntrega: string | null;
  // No hay `sucursalId`: no lo decide quien llama, sale de la orden.
}

export interface RestriccionesEntrega {
  /** Si no es `null`, solo se entregan órdenes de esta sucursal. */
  sucursalId: string | null;
}

export type ResultadoCrear =
  | { tipo: 'creada'; entrega: Entrega }
  /** Ya había una entrega con ese id: el reintento de una subida. */
  | { tipo: 'existente'; entrega: Entrega }
  /** La orden no existe, o es de otra sucursal que la permitida. */
  | { tipo: 'orden-no-encontrada' }
  | { tipo: 'orden-anulada'; orden: Orden }
  /** La orden ya tiene una entrega, con otro id. */
  | { tipo: 'orden-ya-entregada'; orden: Orden };

/**
 * Registra la entrega y pasa la orden a ENTREGADO, o devuelve la que ya existe.
 *
 * Es UNA sentencia con un CTE que modifica datos: primero el `UPDATE` de la
 * orden, y el `INSERT` de la entrega lee lo que ese UPDATE devolvió. Una sola
 * sentencia es atómica: si el INSERT falla, Postgres deshace también el UPDATE,
 * y si el UPDATE no encuentra la orden en condiciones, el INSERT no tiene de
 * dónde sacar la fila y no inserta nada. Nunca queda una orden ENTREGADO sin su
 * entrega, ni una entrega sobre una orden que no pasó a ENTREGADO.
 *
 * El `UPDATE` bloquea la fila de la orden, así que no hace falta `FOR SHARE`
 * como en pagos: una anulación simultánea espera, o se espera a ella y la
 * condición se vuelve a evaluar sobre la fila ya anulada.
 *
 * A diferencia de pagos, NO hay `ON CONFLICT (id) DO NOTHING`. Ese DO NOTHING
 * solo afecta al INSERT: si el id chocara, el UPDATE ya habría marcado la orden
 * como entregada y quedaría sin entrega. Sin él, un id repetido hace fallar la
 * sentencia entera —y deshace el UPDATE—, y el error se atrapa abajo.
 */
export async function crear(entrega: EntregaNueva, restricciones: RestriccionesEntrega): Promise<ResultadoCrear> {
  let filas: FilaEntrega[];
  let ordenConOtraEntrega = false;
  try {
    // ENTREGAR, a nombre de quien entregó, en la misma sentencia que la entrega
    // y el UPDATE de la orden (SPEC-ALE186-010): las tres cosas o ninguna.
    const { sql, valores } = conAuditoria(
      {
        ctesPrevios: `orden AS (
           UPDATE ordenes
              SET estado = 'ENTREGADO'
            WHERE id = $2
              AND estado = ANY($9::estado_orden[])
              AND ($10::uuid IS NULL OR sucursal_id = $10)
           RETURNING id, sucursal_id, precio_total
         )`,
        sql: `INSERT INTO entregas (id, orden_id, sucursal_id, tipo_retiro, retirado_por_nombre,
                                    retirado_por_carnet, usuario_entrega_id, precio_final, fecha_entrega)
              SELECT $1, orden.id, orden.sucursal_id, $3, $4, $5, $6,
                     COALESCE($7::numeric, orden.precio_total),
                     COALESCE($8::timestamptz::timestamp, LOCALTIMESTAMP)
                FROM orden
              RETURNING ${COLUMNAS}`,
        valores: [
          entrega.id,
          entrega.ordenId,
          entrega.tipoRetiro,
          entrega.retiradoPorNombre,
          entrega.retiradoPorCarnet,
          entrega.usuarioEntregaId,
          // El dinero va a Postgres como el string decimal, nunca como float.
          entrega.precioFinal === null ? null : formatear(entrega.precioFinal),
          entrega.fechaEntrega,
          ESTADOS_ENTREGABLES,
          restricciones.sucursalId,
        ],
        columnas: COLUMNAS,
      },
      { usuarioId: entrega.usuarioEntregaId, accion: 'ENTREGAR', tabla: 'entregas' },
    );
    const { rows } = await pool.query<FilaEntrega>(sql, valores);
    filas = rows;
  } catch (error) {
    // En los dos casos la sentencia falló entera, así que la orden no se tocó.
    //   - El id ya existe: un reintento (se resuelve abajo, buscándolo).
    //   - La orden ya tiene entrega aunque no figure ENTREGADO: datos de antes
    //     de esta spec, cargados a mano. No se puede entregar dos veces.
    ordenConOtraEntrega = violoUnicidad(error, RESTRICCION_UNA_POR_ORDEN);
    if (!ordenConOtraEntrega && !violoUnicidad(error, RESTRICCION_ID)) throw error;
    filas = [];
  }

  const insertada = filas[0];
  if (insertada !== undefined) return { tipo: 'creada', entrega: aEntrega(insertada) };

  // No se insertó. Se averigua por qué, y el reintento va primero: si la entrega
  // ya está guardada, que la orden figure ENTREGADO es consecuencia de ella.
  const existente = await buscarPorId(entrega.id);
  if (existente !== null) return { tipo: 'existente', entrega: existente };

  const orden = await ordenes.buscarPorId(entrega.ordenId);
  const visible =
    orden !== null && (restricciones.sucursalId === null || orden.sucursalId === restricciones.sucursalId);
  if (!visible) return { tipo: 'orden-no-encontrada' };
  if (orden.estado === 'ANULADO') return { tipo: 'orden-anulada', orden };
  if (orden.estado === 'ENTREGADO' || ordenConOtraEntrega) return { tipo: 'orden-ya-entregada', orden };

  // Existe, es visible, está en un estado entregable y no chocó con nada, pero
  // no se insertó: no debería pasar. Mejor enterarse que inventar un motivo.
  throw new Error(`La entrega ${entrega.id} no se insertó y no se encuentra el motivo.`);
}
