// Model de estadísticas: las agregaciones del dashboard del admin — SPEC-ALE186-008.
//
// Es la única lectura del sistema que no sale de la base local del dispositivo
// (CLAUDE.md, sección 8): agrega en Postgres, sobre las tablas y las vistas
// `vw_saldos` y `vw_pendientes_recoger`, que no se reescriben acá.
//
// Dos reglas que valen para todas las consultas de este archivo:
//
//   - TODA suma la hace Postgres, sobre NUMERIC, y llega como texto decimal
//     ("125.50"). JavaScript no suma ni un monto: ni siquiera los totales por
//     sucursal o el general, que salen de funciones de ventana (`OVER`).
//
//   - Las fechas se miran en la hora del negocio, no en la del servidor (ver
//     `horaDelNegocio`, en `utils/periodo.ts`).
import { pool } from '../db/pool.js';
import { METODOS_PAGO, type EstadoOrden, type MetodoPago } from '../utils/dominio.js';
import { ZONA_NEGOCIO, horaDelNegocio, type Periodo } from '../utils/periodo.js';

// La zona, el período y la conversión a la hora del negocio viven en
// `utils/periodo.ts` desde SPEC-ALE186-012: los comparte con la auditoría.
// `ZONA_NEGOCIO` y `Periodo` se reexportan para quien ya los importaba de acá.
export { ZONA_NEGOCIO, type Periodo };

/** El día, en la hora del negocio, de una columna TIMESTAMP (ver `horaDelNegocio`). */
function diaLocal(columna: string, parametroZona: string): string {
  return horaDelNegocio(columna, parametroZona);
}

// ------------------------------------------------------------------
//  Ingresos
// ------------------------------------------------------------------

export type MontosPorMetodo = Record<MetodoPago, string>;

export interface IngresosSucursal {
  sucursalId: string;
  sucursal: string;
  total: string;
  porMetodo: MontosPorMetodo;
}

export interface Ingresos {
  total: string;
  porSucursal: IngresosSucursal[];
}

interface FilaIngreso {
  sucursal_id: string;
  sucursal: string;
  metodo: MetodoPago;
  total_metodo: string;
  total_sucursal: string;
  total_general: string;
}

const CERO = '0.00';

function metodosEnCero(): MontosPorMetodo {
  return Object.fromEntries(METODOS_PAGO.map((metodo) => [metodo, CERO])) as MontosPorMetodo;
}

/**
 * Lo cobrado en el período, por sucursal y por método de pago.
 *
 * Una fila por (sucursal, método) con cobros. Las funciones de ventana agregan
 * sobre esas filas ya agrupadas: `SUM(SUM(monto)) OVER (PARTITION BY sucursal)`
 * es "la suma de los totales por método de esta sucursal", y `OVER ()` lo mismo
 * sobre todas. Así cada fila trae también el total de su sucursal y el general,
 * calculados en Postgres, sin una segunda consulta.
 */
export async function ingresos(periodo: Periodo): Promise<Ingresos> {
  const { rows } = await pool.query<FilaIngreso>(
    `SELECT p.sucursal_id,
            s.nombre AS sucursal,
            p.metodo,
            SUM(p.monto)::numeric(14,2)                                        AS total_metodo,
            (SUM(SUM(p.monto)) OVER (PARTITION BY p.sucursal_id))::numeric(14,2) AS total_sucursal,
            (SUM(SUM(p.monto)) OVER ())::numeric(14,2)                          AS total_general
       FROM pagos p
       JOIN sucursales s ON s.id = p.sucursal_id
      WHERE ${diaLocal('p.fecha_pago', '$4')}::date BETWEEN $1::date AND $2::date
        AND ($3::uuid IS NULL OR p.sucursal_id = $3)
      GROUP BY p.sucursal_id, s.nombre, p.metodo
      ORDER BY s.nombre, p.sucursal_id, p.metodo`,
    [periodo.desde, periodo.hasta, periodo.sucursalId, ZONA_NEGOCIO],
  );

  // Armar la forma de la respuesta: agrupar filas por sucursal y completar con
  // "0.00" los métodos sin cobros. Esto es reacomodar, no sumar.
  const porSucursal = new Map<string, IngresosSucursal>();
  for (const fila of rows) {
    let sucursal = porSucursal.get(fila.sucursal_id);
    if (sucursal === undefined) {
      sucursal = {
        sucursalId: fila.sucursal_id,
        sucursal: fila.sucursal,
        total: fila.total_sucursal,
        porMetodo: metodosEnCero(),
      };
      porSucursal.set(fila.sucursal_id, sucursal);
    }
    sucursal.porMetodo[fila.metodo] = fila.total_metodo;
  }

  return { total: rows[0]?.total_general ?? CERO, porSucursal: [...porSucursal.values()] };
}

// ------------------------------------------------------------------
//  Antigüedad
// ------------------------------------------------------------------

export const TRAMOS = ['HASTA_7_DIAS', 'DE_8_A_30_DIAS', 'MAS_DE_30_DIAS'] as const;
export type Tramo = (typeof TRAMOS)[number];

// Los días se cuentan entre el día local de la entrada y `hoy`, que lo manda el
// controller ($hoy): así un test puede fijar "hoy" sin depender del reloj.
// Una fecha en el futuro (el reloj de una tablet adelantado) cuenta como reciente.
function tramoDe(columnaDias: string): string {
  return `CASE WHEN ${columnaDias} <= 7 THEN 'HASTA_7_DIAS'
               WHEN ${columnaDias} <= 30 THEN 'DE_8_A_30_DIAS'
               ELSE 'MAS_DE_30_DIAS' END`;
}

// Los tres tramos, en orden, para que aparezcan aunque no tengan ninguna orden.
const LOS_TRES_TRAMOS = `(VALUES (1, 'HASTA_7_DIAS'), (2, 'DE_8_A_30_DIAS'), (3, 'MAS_DE_30_DIAS'))
                           AS t(posicion, tramo)`;

interface FilaTramo {
  tramo: Tramo;
  cantidad: number;
  total: string;
  cantidad_general: number;
  total_general: string;
}

// ------------------------------------------------------------------
//  Saldos pendientes
// ------------------------------------------------------------------

export interface OrdenConSaldo {
  ordenId: string;
  numeroBoleta: string;
  cliente: string;
  sucursalId: string;
  estado: EstadoOrden;
  montoACobrar: string;
  totalPagado: string;
  saldoPendiente: string;
  /** En la hora del negocio: `YYYY-MM-DD HH:MM:SS`. */
  fechaEntrada: string;
  dias: number;
}

export interface Saldos {
  total: string;
  cantidad: number;
  porAntiguedad: { tramo: Tramo; cantidad: number; total: string }[];
  ordenes: OrdenConSaldo[];
}

interface FilaSaldo {
  orden_id: string;
  numero_boleta: string;
  cliente: string;
  sucursal_id: string;
  estado: EstadoOrden;
  monto_a_cobrar: string;
  total_pagado: string;
  saldo_pendiente: string;
  fecha_entrada: string;
  dias: number;
}

// Las órdenes con deuda del período. `vw_saldos` ya resuelve cuánto se debe
// (precio_final si hubo entrega, precio_total si no, menos lo pagado); no tiene
// fecha, así que se cruza con `ordenes` por id para filtrar y contar los días.
// Parámetros: $1 desde, $2 hasta, $3 sucursal, $4 zona, $5 hoy.
const SALDOS_DEL_PERIODO = `
  SELECT v.orden_id, v.numero_boleta, v.cliente, v.sucursal_id, v.estado,
         v.monto_a_cobrar::numeric(14,2) AS monto_a_cobrar,
         v.total_pagado::numeric(14,2)   AS total_pagado,
         v.saldo_pendiente::numeric(14,2) AS saldo_pendiente,
         to_char(${diaLocal('o.fecha_entrada', '$4')}, 'YYYY-MM-DD HH24:MI:SS') AS fecha_entrada,
         ($5::date - ${diaLocal('o.fecha_entrada', '$4')}::date)               AS dias
    FROM vw_saldos v
    JOIN ordenes o ON o.id = v.orden_id
   WHERE v.estado <> 'ANULADO'
     AND v.saldo_pendiente > 0
     AND ${diaLocal('o.fecha_entrada', '$4')}::date BETWEEN $1::date AND $2::date
     AND ($3::uuid IS NULL OR v.sucursal_id = $3)`;

/** Las órdenes con saldo pendiente, por antigüedad. `hoy` en `YYYY-MM-DD`. */
export async function saldos(periodo: Periodo, hoy: string): Promise<Saldos> {
  const parametros = [periodo.desde, periodo.hasta, periodo.sucursalId, ZONA_NEGOCIO, hoy];

  const [lista, tramos] = await Promise.all([
    pool.query<FilaSaldo>(`${SALDOS_DEL_PERIODO} ORDER BY o.fecha_entrada, v.numero_boleta`, parametros),
    pool.query<FilaTramo>(
      `WITH base AS (${SALDOS_DEL_PERIODO})
       SELECT t.tramo,
              COUNT(base.orden_id)::int                                       AS cantidad,
              COALESCE(SUM(base.saldo_pendiente), 0)::numeric(14,2)          AS total,
              (SUM(COUNT(base.orden_id)) OVER ())::int                        AS cantidad_general,
              (SUM(COALESCE(SUM(base.saldo_pendiente), 0)) OVER ())::numeric(14,2) AS total_general
         FROM ${LOS_TRES_TRAMOS}
         LEFT JOIN base ON (${tramoDe('base.dias')}) = t.tramo
        GROUP BY t.posicion, t.tramo
        ORDER BY t.posicion`,
      parametros,
    ),
  ]);

  return {
    total: tramos.rows[0]?.total_general ?? CERO,
    cantidad: tramos.rows[0]?.cantidad_general ?? 0,
    porAntiguedad: tramos.rows.map(({ tramo, cantidad, total }) => ({ tramo, cantidad, total })),
    ordenes: lista.rows.map((fila) => ({
      ordenId: fila.orden_id,
      numeroBoleta: fila.numero_boleta,
      cliente: fila.cliente,
      sucursalId: fila.sucursal_id,
      estado: fila.estado,
      montoACobrar: fila.monto_a_cobrar,
      totalPagado: fila.total_pagado,
      saldoPendiente: fila.saldo_pendiente,
      fechaEntrada: fila.fecha_entrada,
      dias: fila.dias,
    })),
  };
}

// ------------------------------------------------------------------
//  Ropa sin recoger
// ------------------------------------------------------------------

export interface OrdenSinRecoger {
  ordenId: string;
  numeroBoleta: string;
  cliente: string;
  telefono: string;
  descripcion: string;
  sucursal: string;
  /** En la hora del negocio: `YYYY-MM-DD HH:MM:SS`. */
  fechaEntrada: string;
  fechaEstimadaSalida: string | null;
  precioTotal: string;
  dias: number;
}

export interface SinRecoger {
  cantidad: number;
  porAntiguedad: { tramo: Tramo; cantidad: number }[];
  ordenes: OrdenSinRecoger[];
}

interface FilaSinRecoger {
  id: string;
  numero_boleta: string;
  cliente: string;
  telefono: string;
  descripcion: string;
  sucursal: string;
  fecha_entrada: string;
  fecha_estimada_salida: string | null;
  precio_total: string;
  dias: number;
}

// `vw_pendientes_recoger` ya resuelve "sin entrega y no anulada", pero trae el
// NOMBRE de la sucursal y no su id: para filtrar por `sucursal_id` se cruza con
// `ordenes` por id. Cambiar la vista obligaría a todos a recrear su base.
// Parámetros: $1 desde, $2 hasta, $3 sucursal, $4 zona, $5 hoy.
const SIN_RECOGER_DEL_PERIODO = `
  SELECT v.id, v.numero_boleta, v.cliente, v.telefono, v.descripcion, v.sucursal,
         to_char(${diaLocal('v.fecha_entrada', '$4')}, 'YYYY-MM-DD HH24:MI:SS') AS fecha_entrada,
         v.fecha_estimada_salida,
         v.precio_total::numeric(14,2) AS precio_total,
         ($5::date - ${diaLocal('v.fecha_entrada', '$4')}::date) AS dias
    FROM vw_pendientes_recoger v
    JOIN ordenes o ON o.id = v.id
   WHERE ${diaLocal('v.fecha_entrada', '$4')}::date BETWEEN $1::date AND $2::date
     AND ($3::uuid IS NULL OR o.sucursal_id = $3)`;

/** La ropa que sigue en el local, por antigüedad. `hoy` en `YYYY-MM-DD`. */
export async function sinRecoger(periodo: Periodo, hoy: string): Promise<SinRecoger> {
  const parametros = [periodo.desde, periodo.hasta, periodo.sucursalId, ZONA_NEGOCIO, hoy];

  const [lista, tramos] = await Promise.all([
    pool.query<FilaSinRecoger>(`${SIN_RECOGER_DEL_PERIODO} ORDER BY v.fecha_entrada, v.numero_boleta`, parametros),
    pool.query<Omit<FilaTramo, 'total' | 'total_general'>>(
      `WITH base AS (${SIN_RECOGER_DEL_PERIODO})
       SELECT t.tramo,
              COUNT(base.id)::int                  AS cantidad,
              (SUM(COUNT(base.id)) OVER ())::int   AS cantidad_general
         FROM ${LOS_TRES_TRAMOS}
         LEFT JOIN base ON (${tramoDe('base.dias')}) = t.tramo
        GROUP BY t.posicion, t.tramo
        ORDER BY t.posicion`,
      parametros,
    ),
  ]);

  return {
    cantidad: tramos.rows[0]?.cantidad_general ?? 0,
    porAntiguedad: tramos.rows.map(({ tramo, cantidad }) => ({ tramo, cantidad })),
    ordenes: lista.rows.map((fila) => ({
      ordenId: fila.id,
      numeroBoleta: fila.numero_boleta,
      cliente: fila.cliente,
      telefono: fila.telefono,
      descripcion: fila.descripcion,
      sucursal: fila.sucursal,
      fechaEntrada: fila.fecha_entrada,
      fechaEstimadaSalida: fila.fecha_estimada_salida,
      precioTotal: fila.precio_total,
      dias: fila.dias,
    })),
  };
}
