// Model de pagos: el único sitio que escribe en la tabla `pagos` — SPEC-ALE186-005.
//
// Mismas dos reglas de escritura que clientes y órdenes: el id lo genera el
// dispositivo, y un reintento de la misma subida no duplica ni falla.
//
// Lo nuevo es que un pago depende de su orden para dos cosas: de ella sale el
// `sucursal_id` (que existe solo para que las sync rules filtren sin JOIN,
// CLAUDE.md sección 7) y ella decide si se le puede cobrar (no si está ANULADA).
// Las dos se resuelven en la misma sentencia que inserta — ver `crear`.
import { pool } from '../db/pool.js';
import type { MetodoPago, TipoPago } from '../utils/dominio.js';
import { formatear, type Centavos } from '../utils/money.js';
import * as ordenes from './ordenes.model.js';
import type { Orden } from './ordenes.model.js';

export interface Pago {
  id: string;
  ordenId: string;
  sucursalId: string;
  /** Como lo entrega Postgres: `"12.50"`. Para operar, `money.parse`. */
  monto: string;
  tipo: TipoPago;
  metodo: MetodoPago;
  fechaPago: string;
  usuarioId: string;
}

interface FilaPago {
  id: string;
  orden_id: string;
  sucursal_id: string;
  monto: string;
  tipo: TipoPago;
  metodo: MetodoPago;
  fecha_pago: string;
  usuario_id: string;
}

function aPago(fila: FilaPago): Pago {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    sucursalId: fila.sucursal_id,
    monto: fila.monto,
    tipo: fila.tipo,
    metodo: fila.metodo,
    fechaPago: fila.fecha_pago,
    usuarioId: fila.usuario_id,
  };
}

const COLUMNAS = 'id, orden_id, sucursal_id, monto, tipo, metodo, fecha_pago, usuario_id';

export async function buscarPorId(id: string): Promise<Pago | null> {
  const { rows } = await pool.query<FilaPago>(`SELECT ${COLUMNAS} FROM pagos WHERE id = $1`, [id]);
  const fila = rows[0];
  return fila === undefined ? null : aPago(fila);
}

export interface PagoNuevo {
  id: string;
  ordenId: string;
  monto: Centavos;
  tipo: TipoPago;
  metodo: MetodoPago;
  usuarioId: string;
  /** ISO 8601 con zona, tal como lo manda el dispositivo; `null` = ahora. */
  fechaPago: string | null;
  // No hay `sucursalId`: no lo decide quien llama, sale de la orden.
}

export interface RestriccionesPago {
  /** Si no es `null`, solo se cobran órdenes de esta sucursal. */
  sucursalId: string | null;
}

export type ResultadoCrear =
  | { tipo: 'creado'; pago: Pago }
  /** Ya había un pago con ese id: el reintento de una subida. */
  | { tipo: 'existente'; pago: Pago }
  /** La orden no existe, o es de otra sucursal que la permitida. */
  | { tipo: 'orden-no-encontrada' }
  | { tipo: 'orden-anulada'; orden: Orden };

/**
 * Registra el pago, o devuelve el que ya existe con ese id.
 *
 * Es un `INSERT ... SELECT`: la fila que se inserta sale de leer la orden, así
 * que si la orden no cumple las condiciones, el SELECT no devuelve nada y no se
 * inserta nada. Tres cosas quedan resueltas en una sola sentencia:
 *
 *   - `sucursal_id` se copia de la orden, nunca del cuerpo ni de la sesión.
 *   - Una orden ANULADA no admite cobros.
 *   - Un EMPLEADO no cobra órdenes de otra sucursal.
 *
 * `FOR SHARE` bloquea la fila de la orden mientras dura la sentencia. Sin él,
 * otra petición podría anular la orden entre que este SELECT la lee y el INSERT
 * se confirma, y quedaría un cobro sobre una orden anulada. Con él, la
 * anulación espera; o al revés, si la anulación llegó antes, este SELECT espera
 * a que termine y vuelve a evaluar la condición sobre la fila ya anulada.
 *
 * `ON CONFLICT (id) DO NOTHING` hace idempotente el reintento, igual que en
 * órdenes. Solo cuando no se insertó nada se averigua por qué, en este orden:
 * primero el pago (un reintento gana aunque la orden se haya anulado después de
 * cobrar: el cobro ya está registrado), y después la orden.
 */
export async function crear(pago: PagoNuevo, restricciones: RestriccionesPago): Promise<ResultadoCrear> {
  const { rows } = await pool.query<FilaPago>(
    `INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo, usuario_id, fecha_pago)
     SELECT $1, o.id, o.sucursal_id, $3, $4, $5, $6,
            COALESCE($7::timestamptz::timestamp, LOCALTIMESTAMP)
       FROM ordenes o
      WHERE o.id = $2
        AND o.estado <> 'ANULADO'
        AND ($8::uuid IS NULL OR o.sucursal_id = $8)
        FOR SHARE
     ON CONFLICT (id) DO NOTHING
     RETURNING ${COLUMNAS}`,
    [
      pago.id,
      pago.ordenId,
      // El dinero va a Postgres como el string decimal, nunca como float.
      formatear(pago.monto),
      pago.tipo,
      pago.metodo,
      pago.usuarioId,
      pago.fechaPago,
      restricciones.sucursalId,
    ],
  );

  const insertado = rows[0];
  if (insertado !== undefined) return { tipo: 'creado', pago: aPago(insertado) };

  const existente = await buscarPorId(pago.id);
  if (existente !== null) return { tipo: 'existente', pago: existente };

  // La orden se lee por su model: este solo la nombra en el INSERT de arriba.
  const orden = await ordenes.buscarPorId(pago.ordenId);
  const visible =
    orden !== null && (restricciones.sucursalId === null || orden.sucursalId === restricciones.sucursalId);
  if (!visible) return { tipo: 'orden-no-encontrada' };
  if (orden.estado === 'ANULADO') return { tipo: 'orden-anulada', orden };

  // Existe, es visible y no está anulada, pero no se insertó: no hay borrado de
  // pagos ni de órdenes, así que no debería pasar. Mejor enterarse que inventar.
  throw new Error(`El pago ${pago.id} no se insertó y no se encuentra el motivo.`);
}
