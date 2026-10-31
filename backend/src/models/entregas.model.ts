// Model de entregas: el único sitio que escribe en la tabla `entregas` — SPEC-ALE186-006.
//
// Mismas reglas de escritura que pagos (SPEC-ALE186-005): id del dispositivo,
// reintento idempotente, y `sucursal_id` copiado de la orden en la misma
// sentencia que inserta. La ropa se retira en la misma sucursal donde se dejó,
// así que la entrega queda siempre con la sucursal de su orden.
//
// Desde SPEC-KRILINXI-056 la ropa solo se entrega con la boleta pagada por completo: lo cobrado (los pagos que la
// orden ya tiene) tiene que cubrir el precio final. Como el pago final y la entrega suben como dos pedidos, el
// dispositivo manda primero el pago y después la entrega (ver `registrarEntrega` en el frontend).
//
// Desde SPEC-KRILINXI-068 el precio final ya no lo escribe nadie a mano: es el `precio_total` de la boleta más sus cargos
// al entregar (los renglones de `orden_items` con `momento = 'ENTREGA'`), y lo calcula esta sentencia. La tablet lo manda
// igual, y si no coincide se rechaza: así una entrega cuyo cargo no llegó (o una de una versión anterior, con un precio
// libre) no se guarda con un precio que nadie eligió. Los cargos suben antes que la entrega, como el pago final.
//
// Desde SPEC-KRILINXI-070 una entrega puede ser un **reembolso** (`motivoReembolso`): la ropa sale sin cobrar lo que falta, la
// orden pasa a REEMBOLSADO y el `precio_final` es lo ya cobrado, así que el saldo queda en 0 sin tocar `vw_saldos`. Es la
// misma sentencia de siempre con dos condiciones menos (el precio y el saldo), y solo cuando viene el motivo: la entrega
// común las sigue aplicando igual.
//
// Lo nuevo es que registrar una entrega escribe en DOS tablas: la entrega, y la
// orden, que pasa a ENTREGADO. Tienen que ocurrir las dos o ninguna — ver `crear`.
import pg from 'pg';
import { pool } from '../db/pool.js';
import { ESTADOS_ABIERTOS, type TipoRetiro } from '../utils/dominio.js';
import { formatear, type Centavos } from '../utils/money.js';
import { conAuditoria, type Revision } from './auditoria.model.js';
import * as ordenes from './ordenes.model.js';
import { SUBTOTAL_SQL, type Orden } from './ordenes.model.js';

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
  /** El porqué de la entrega sin cobrar; `null` en una entrega común — SPEC-KRILINXI-070. */
  motivoReembolso: string | null;
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
  motivo_reembolso: string | null;
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
    motivoReembolso: fila.motivo_reembolso,
  };
}

const COLUMNAS =
  'id, orden_id, sucursal_id, fecha_entrega, tipo_retiro, retirado_por_nombre, ' +
  'retirado_por_carnet, usuario_entrega_id, precio_final, motivo_reembolso';

/**
 * Desde qué estados se puede entregar: todos los que no están cerrados.
 *
 * Desde SPEC-KRILINXI-067 solo queda RECIBIDO. Se sigue derivando de "no cerrado" y no de
 * un estado fijo: si algún día vuelve a haber pasos intermedios, rechazar una entrega
 * porque nadie los marcó perdería el registro de algo que ya pasó en el mostrador.
 */
export const ESTADOS_ENTREGABLES = ESTADOS_ABIERTOS;

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

/**
 * El precio final de una orden en SQL: su `precio_total` más los cargos al entregar — SPEC-KRILINXI-068. `alias` es
 * la tabla `ordenes` de la consulta que lo usa. Una boleta sin cargos (o de antes de los renglones) da su total.
 */
function precioFinalSql(alias: string): string {
  return `(${alias}.precio_total + COALESCE((SELECT SUM(${SUBTOTAL_SQL('i')}) FROM orden_items i
                                           WHERE i.orden_id = ${alias}.id AND i.momento = 'ENTREGA'), 0))`;
}

/** Lo ya cobrado de una orden en SQL: la suma de sus pagos (0 si no tiene). `alias` es su tabla `ordenes`. */
function cobradoSql(alias: string): string {
  return `COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = ${alias}.id), 0)`;
}

/**
 * El precio final que le corresponde a la orden y lo que faltaría cobrar con él, como texto de Postgres (`"25.50"`).
 * Solo sirve para explicar por qué la sentencia de `crear` no insertó nada.
 */
async function cuentasAlEntregar(ordenId: string): Promise<{ precioFinal: string; saldo: string } | null> {
  const { rows } = await pool.query<{ precio_final: string; saldo: string }>(
    `SELECT ${precioFinalSql('o')}::text AS precio_final,
            (${precioFinalSql('o')}
              - COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = o.id), 0))::text AS saldo
       FROM ordenes o
      WHERE o.id = $1`,
    [ordenId],
  );
  const fila = rows[0];
  return fila === undefined ? null : { precioFinal: fila.precio_final, saldo: fila.saldo };
}

export interface EntregaNueva {
  id: string;
  ordenId: string;
  tipoRetiro: TipoRetiro;
  retiradoPorNombre: string | null;
  retiradoPorCarnet: string | null;
  usuarioEntregaId: string;
  /**
   * El que calculó la tablet; `null` = no lo manda. No decide nada: el precio final lo calcula el servidor (el total
   * más los cargos), y este solo se compara con él (SPEC-KRILINXI-068).
   */
  precioFinal: Centavos | null;
  /** ISO 8601 con zona, tal como lo manda el dispositivo; `null` = ahora. */
  fechaEntrega: string | null;
  /**
   * Si viene, es un reembolso (SPEC-KRILINXI-070): ya validado, con contenido y sin pasarse de largo. `null` = una entrega
   * común. Con reembolso, `precioFinal` no se compara con nada: el precio final es lo ya cobrado.
   */
  motivoReembolso: string | null;
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
  | { tipo: 'orden-ya-entregada'; orden: Orden }
  /** La ropa se puede entregar, pero lo cobrado no cubre el precio final. `saldo` es lo que falta, como lo da Postgres (`"25.50"`). */
  | { tipo: 'saldo-pendiente'; orden: Orden; saldo: string }
  /** El precio final que mandó la tablet no es el total más los cargos que tiene la orden (SPEC-KRILINXI-068). */
  | { tipo: 'precio-distinto'; orden: Orden; precioFinal: string };

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
 * La regla del saldo (SPEC-KRILINXI-056) es una condición más del mismo `UPDATE`: la orden solo pasa a ENTREGADO si lo cobrado
 * cubre el precio final. Si no, el UPDATE no devuelve nada, el INSERT no inserta nada y no
 * se escribe ni la entrega ni la auditoría. Un pago nunca se borra, así que una carrera con otro cobro solo puede ayudar.
 *
 * El precio final (SPEC-KRILINXI-068) también sale de ahí: el `UPDATE` lo calcula (`precioFinalSql`) y lo devuelve, y el
 * INSERT lo guarda. Si la tablet mandó uno y no es ese, es otra condición que no se cumple, y no se escribe nada.
 *
 * A diferencia de pagos, NO hay `ON CONFLICT (id) DO NOTHING`. Ese DO NOTHING
 * solo afecta al INSERT: si el id chocara, el UPDATE ya habría marcado la orden
 * como entregada y quedaría sin entrega. Sin él, un id repetido hace fallar la
 * sentencia entera —y deshace el UPDATE—, y el error se atrapa abajo.
 */
export async function crear(
  entrega: EntregaNueva,
  restricciones: RestriccionesEntrega,
  /** Si la escritura queda marcada para el admin (SPEC-ALE186-018). */
  revision: Revision | null = null,
): Promise<ResultadoCrear> {
  let filas: FilaEntrega[];
  let ordenConOtraEntrega = false;
  try {
    // ENTREGAR, a nombre de quien entregó, en la misma sentencia que la entrega
    // y el UPDATE de la orden (SPEC-ALE186-010): las tres cosas o ninguna.
    const { sql, valores } = conAuditoria(
      {
        ctesPrevios: `orden AS (
           UPDATE ordenes
              SET estado = CASE WHEN $11::text IS NULL THEN 'ENTREGADO'::estado_orden ELSE 'REEMBOLSADO'::estado_orden END
            WHERE id = $2
              AND estado = ANY($9::estado_orden[])
              AND ($10::uuid IS NULL OR sucursal_id = $10)
              AND ($11::text IS NOT NULL OR $7::numeric IS NULL OR $7::numeric = ${precioFinalSql('ordenes')})
              AND ($11::text IS NOT NULL OR ${precioFinalSql('ordenes')} <= ${cobradoSql('ordenes')})
           RETURNING id, sucursal_id,
                     CASE WHEN $11::text IS NULL THEN ${precioFinalSql('ordenes')} ELSE ${cobradoSql('ordenes')} END AS precio_final
         )`,
        sql: `INSERT INTO entregas (id, orden_id, sucursal_id, tipo_retiro, retirado_por_nombre,
                                    retirado_por_carnet, usuario_entrega_id, precio_final, fecha_entrega, motivo_reembolso)
              SELECT $1, orden.id, orden.sucursal_id, $3, $4, $5, $6,
                     orden.precio_final,
                     COALESCE($8::timestamptz::timestamp, LOCALTIMESTAMP),
                     $11::text
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
          entrega.motivoReembolso,
        ],
        columnas: COLUMNAS,
      },
      { usuarioId: entrega.usuarioEntregaId, accion: 'ENTREGAR', tabla: 'entregas', revision },
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
  if (orden.estado === 'ENTREGADO' || orden.estado === 'REEMBOLSADO' || ordenConOtraEntrega) {
    return { tipo: 'orden-ya-entregada', orden };
  }

  // Entregable y sin choques: queda el precio (SPEC-KRILINXI-068) y la regla del saldo (SPEC-KRILINXI-056). El precio
  // va primero: si la tablet calculó con otros cargos, lo que "falta" según ella no es lo que falta de verdad.
  // Un reembolso no pasa por ninguna de las dos (SPEC-KRILINXI-070): no tiene precio que comparar ni saldo que cubrir.
  const cuentas = entrega.motivoReembolso === null ? await cuentasAlEntregar(entrega.ordenId) : null;
  if (cuentas !== null) {
    if (entrega.precioFinal !== null && formatear(entrega.precioFinal) !== cuentas.precioFinal) {
      return { tipo: 'precio-distinto', orden, precioFinal: cuentas.precioFinal };
    }
    const { saldo } = cuentas;
    if (!saldo.startsWith('-') && saldo !== '0.00') return { tipo: 'saldo-pendiente', orden, saldo };
  }

  // Existe, es visible, está en un estado entregable y no chocó con nada, pero
  // no se insertó: no debería pasar. Mejor enterarse que inventar un motivo.
  throw new Error(`La entrega ${entrega.id} no se insertó y no se encuentra el motivo.`);
}
