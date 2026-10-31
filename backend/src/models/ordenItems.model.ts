// Model de los renglones de la boleta: el único sitio que escribe en `orden_items` — SPEC-KRILINXI-068.
//
// Las mismas reglas de escritura que pagos (SPEC-ALE186-005): el id lo genera el dispositivo, un reintento no
// duplica ni falla, y `sucursal_id` se copia de la orden en el mismo `INSERT … SELECT`. Lo nuevo es la regla del
// total: los renglones de INGRESO de una orden no pueden sumar más que su `precio_total`. Los de ENTREGA (los
// cargos al entregar) se suman encima, sin tope: forman el precio final de la entrega (ver `entregas.model.ts`).
//
// Un renglón no se edita ni se borra desde el mostrador: corregirlo es del admin (SPEC-KRILINXI-071).
import { pool } from '../db/pool.js';
import { ESTADOS_ABIERTOS, type MomentoItem } from '../utils/dominio.js';
import { formatear, type Centavos } from '../utils/money.js';
import { conAuditoria, type Revision } from './auditoria.model.js';
import * as ordenes from './ordenes.model.js';
import { SUBTOTAL_SQL, type Orden } from './ordenes.model.js';

export interface OrdenItem {
  id: string;
  ordenId: string;
  sucursalId: string;
  momento: MomentoItem;
  /** Su lugar en la boleta, dentro de su momento: 0, 1, 2… */
  posicion: number;
  descripcion: string;
  /** Como la entrega Postgres: `"2.50"`. */
  cantidad: string;
  /** Como lo entrega Postgres: `"12.50"`. Para operar, `money.parse`. */
  precioUnitario: string;
}

interface FilaItem {
  id: string;
  orden_id: string;
  sucursal_id: string;
  momento: MomentoItem;
  posicion: number;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
}

function aItem(fila: FilaItem): OrdenItem {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    sucursalId: fila.sucursal_id,
    momento: fila.momento,
    posicion: fila.posicion,
    descripcion: fila.descripcion,
    cantidad: fila.cantidad,
    precioUnitario: fila.precio_unitario,
  };
}

const COLUMNAS = 'id, orden_id, sucursal_id, momento, posicion, descripcion, cantidad, precio_unitario';

export async function buscarPorId(id: string): Promise<OrdenItem | null> {
  const { rows } = await pool.query<FilaItem>(`SELECT ${COLUMNAS} FROM orden_items WHERE id = $1`, [id]);
  const fila = rows[0];
  return fila === undefined ? null : aItem(fila);
}

export interface ItemNuevo {
  id: string;
  ordenId: string;
  momento: MomentoItem;
  posicion: number;
  descripcion: string;
  /** En centésimas: 2,5 kilos son `250`. */
  cantidad: number;
  precioUnitario: Centavos;
  /** Quién lo cargó, de la sesión. Solo va a la auditoría: el renglón no lo guarda. */
  usuarioId: string;
  // No hay `sucursalId`: no lo decide quien llama, sale de la orden.
}

export interface RestriccionesItem {
  /** Si no es `null`, solo se agregan renglones a órdenes de esta sucursal. */
  sucursalId: string | null;
}

export type ResultadoCrear =
  | { tipo: 'creado'; item: OrdenItem }
  /** Ya había un renglón con ese id: el reintento de una subida. */
  | { tipo: 'existente'; item: OrdenItem }
  /** La orden no existe, o es de otra sucursal que la permitida. */
  | { tipo: 'orden-no-encontrada' }
  /** La orden está anulada, entregada o reembolsada: ya no admite renglones. */
  | { tipo: 'orden-cerrada'; orden: Orden }
  /** El renglón de INGRESO haría que los renglones sumen más que el total. `disponible`, lo que queda (`"5.00"`). */
  | { tipo: 'total-excedido'; orden: Orden; disponible: string };

/**
 * Agrega el renglón, o devuelve el que ya existe con ese id.
 *
 * Son DOS sentencias en una transacción, y no una sola como en pagos. La regla del total suma los renglones que la
 * orden ya tiene, y en Postgres (con el aislamiento de siempre, READ COMMITTED) cada sentencia mira la base como
 * estaba cuando empezó. Si dos renglones de la misma orden llegaran a la vez en una sola sentencia cada uno, los dos
 * sumarían sin ver al otro, y entre los dos podrían pasarse del total. Por eso primero se bloquea la fila de la orden
 * (`FOR UPDATE`): el segundo espera ahí a que el primero termine, y su `INSERT`, que empieza después, ya lo cuenta.
 *
 * El bloqueo también ordena al renglón contra la entrega (que hace `UPDATE` de la misma fila): un cargo que llega
 * después de entregar ve la orden ENTREGADO y no entra.
 *
 * El `INSERT … SELECT` resuelve el resto en la misma sentencia, como en pagos: la sucursal se copia de la orden, una
 * orden cerrada no admite renglones, un EMPLEADO solo escribe en la suya, y la fila de auditoría va con él
 * (`conAuditoria`, SPEC-ALE186-010). `ON CONFLICT (id) DO NOTHING` hace idempotente el reintento.
 */
export async function crear(
  item: ItemNuevo,
  restricciones: RestriccionesItem,
  /** Si la escritura queda marcada para el admin (SPEC-ALE186-018). */
  revision: Revision | null = null,
): Promise<ResultadoCrear> {
  const { sql, valores } = conAuditoria(
    {
      sql: `INSERT INTO orden_items (id, orden_id, sucursal_id, momento, posicion, descripcion, cantidad,
                                     precio_unitario)
            SELECT $1, o.id, o.sucursal_id, $3::momento_item, $9, $4, $5::numeric, $6::numeric
              FROM ordenes o
             WHERE o.id = $2
               AND o.estado = ANY($7::estado_orden[])
               AND ($8::uuid IS NULL OR o.sucursal_id = $8)
               AND ($3::momento_item = 'ENTREGA'
                    OR COALESCE((SELECT SUM(${SUBTOTAL_SQL('i')}) FROM orden_items i
                                  WHERE i.orden_id = o.id AND i.momento = 'INGRESO'), 0)
                       + round($5::numeric * $6::numeric, 2) <= o.precio_total)
            ON CONFLICT (id) DO NOTHING
            RETURNING ${COLUMNAS}`,
      valores: [
        item.id,
        item.ordenId,
        item.momento,
        item.descripcion,
        // La cantidad y el precio van a Postgres como el string decimal, nunca como float.
        formatear(item.cantidad),
        formatear(item.precioUnitario),
        ESTADOS_ABIERTOS,
        restricciones.sucursalId,
        item.posicion,
      ],
      columnas: COLUMNAS,
    },
    { usuarioId: item.usuarioId, accion: 'CREAR', tabla: 'orden_items', revision },
  );

  const conexion = await pool.connect();
  let filas: FilaItem[];
  try {
    await conexion.query('BEGIN');
    await conexion.query('SELECT id FROM ordenes WHERE id = $1 FOR UPDATE', [item.ordenId]);
    filas = (await conexion.query<FilaItem>(sql, valores)).rows;
    await conexion.query('COMMIT');
  } catch (error) {
    await conexion.query('ROLLBACK');
    throw error;
  } finally {
    conexion.release();
  }

  const insertado = filas[0];
  if (insertado !== undefined) return { tipo: 'creado', item: aItem(insertado) };

  // No se insertó. El reintento va primero: un renglón ya guardado se devuelve aunque la orden se haya cerrado
  // después (o aunque, contándose a sí mismo, parezca pasarse del total).
  const existente = await buscarPorId(item.id);
  if (existente !== null) return { tipo: 'existente', item: existente };

  const orden = await ordenes.buscarPorId(item.ordenId);
  const visible =
    orden !== null && (restricciones.sucursalId === null || orden.sucursalId === restricciones.sucursalId);
  if (!visible) return { tipo: 'orden-no-encontrada' };
  if (!ESTADOS_ABIERTOS.includes(orden.estado)) return { tipo: 'orden-cerrada', orden };

  if (item.momento === 'INGRESO') {
    const { rows } = await pool.query<{ disponible: string }>(
      `SELECT (o.precio_total - COALESCE((SELECT SUM(${SUBTOTAL_SQL('i')}) FROM orden_items i
                                           WHERE i.orden_id = o.id AND i.momento = 'INGRESO'), 0))::text AS disponible
         FROM ordenes o
        WHERE o.id = $1`,
      [item.ordenId],
    );
    return { tipo: 'total-excedido', orden, disponible: rows[0]?.disponible ?? '0.00' };
  }

  // Abierta, visible y es un cargo (que no tiene tope), pero no se insertó: no debería pasar.
  throw new Error(`El renglón ${item.id} no se insertó y no se encuentra el motivo.`);
}
