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
import { salteo, type Paginacion } from '../utils/paginacion.js';
import { ZONA_NEGOCIO, enElPeriodo, horaDelNegocio, type Periodo } from '../utils/periodo.js';

// La zona, el período y la conversión a la hora del negocio viven en
// `utils/periodo.ts` desde SPEC-ALE186-012: los comparte con la auditoría.
// `ZONA_NEGOCIO` y `Periodo` se reexportan para quien ya los importaba de acá.
export { ZONA_NEGOCIO, type Periodo };

/** El día, en la hora del negocio, de una columna TIMESTAMP (ver `horaDelNegocio`). */
function diaLocal(columna: string, parametroZona: string): string {
  return horaDelNegocio(columna, parametroZona);
}

/**
 * La columna cae en el período. Todas las consultas de este archivo usan los
 * mismos parámetros: $1 desde, $2 hasta, $4 zona. Compara la columna tal cual,
 * para que sirva su índice (SPEC-ALE186-021, ver `enElPeriodo`).
 */
function delPeriodo(columna: string): string {
  return enElPeriodo(columna, { desde: '$1', hasta: '$2', zona: '$4' });
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
      WHERE ${delPeriodo('p.fecha_pago')}
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
     AND ${delPeriodo('o.fecha_entrada')}
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
   WHERE ${delPeriodo('o.fecha_entrada')}
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

// ------------------------------------------------------------------
//  Volumen de órdenes — SPEC-ALE186-013
// ------------------------------------------------------------------

export interface VolumenDia {
  /** `YYYY-MM-DD`, día del negocio. */
  fecha: string;
  /** Todas las que entraron ese día, incluidas las que después se anularon. */
  ordenes: number;
  /** Cuántas de esas están anuladas. No se descuentan de `ordenes`. */
  anuladas: number;
}

export interface Volumen {
  total: number;
  anuladas: number;
  porDia: VolumenDia[];
}

interface FilaVolumen {
  fecha: string;
  ordenes: number;
  anuladas: number;
  total: number;
  anuladas_total: number;
}

/**
 * Las órdenes que entraron por día, con TODOS los días del período.
 *
 * `generate_series` arma la lista de días y el LEFT JOIN cuenta las órdenes de
 * cada uno: un día sin órdenes queda en 0 en vez de desaparecer, y el gráfico
 * no salta días. Es el mismo recurso que los tramos de saldos (`LOS_TRES_TRAMOS`):
 * agrupar sobre una lista fija y no sobre lo que haya en la tabla.
 *
 * La anulada se cuenta en el día en que entró: la ropa entró igual, y el
 * mostrador trabajó. Se informa aparte, con `FILTER`, sin restarla.
 */
export async function volumen(periodo: Periodo): Promise<Volumen> {
  const { rows } = await pool.query<FilaVolumen>(
    `WITH dias AS (
       SELECT d::date AS fecha FROM generate_series($1::date, $2::date, interval '1 day') AS d
     ),
     del_periodo AS (
       SELECT ${diaLocal('o.fecha_entrada', '$4')}::date AS fecha, o.estado
         FROM ordenes o
        WHERE ${delPeriodo('o.fecha_entrada')}
          AND ($3::uuid IS NULL OR o.sucursal_id = $3)
     )
     SELECT to_char(dias.fecha, 'YYYY-MM-DD')                                         AS fecha,
            COUNT(del_periodo.fecha)::int                                             AS ordenes,
            (COUNT(*) FILTER (WHERE del_periodo.estado = 'ANULADO'))::int             AS anuladas,
            (SUM(COUNT(del_periodo.fecha)) OVER ())::int                              AS total,
            (SUM(COUNT(*) FILTER (WHERE del_periodo.estado = 'ANULADO')) OVER ())::int AS anuladas_total
       FROM dias
       LEFT JOIN del_periodo ON del_periodo.fecha = dias.fecha
      GROUP BY dias.fecha
      ORDER BY dias.fecha`,
    [periodo.desde, periodo.hasta, periodo.sucursalId, ZONA_NEGOCIO],
  );

  return {
    total: rows[0]?.total ?? 0,
    anuladas: rows[0]?.anuladas_total ?? 0,
    porDia: rows.map(({ fecha, ordenes, anuladas }) => ({ fecha, ordenes, anuladas })),
  };
}

// ------------------------------------------------------------------
//  Productividad por empleado — SPEC-ALE186-013
// ------------------------------------------------------------------

export interface ProductividadFila {
  usuario: { id: string; nombreCompleto: string };
  sucursal: { id: string; nombre: string };
  ordenesRecibidas: number;
  cobros: number;
  /** Como lo suma Postgres: `"125.50"`. */
  montoCobrado: string;
  entregas: number;
}

interface FilaProductividad {
  usuario_id: string;
  nombre_completo: string;
  sucursal_id: string;
  sucursal: string;
  ordenes_recibidas: number;
  cobros: number;
  monto_cobrado: string;
  entregas: number;
}

/**
 * Lo que hizo cada persona en el período, por sucursal.
 *
 * Las tres cosas que se cuentan viven en tres tablas, cada una con quién la hizo
 * y en qué sucursal. El `UNION ALL` las pone una debajo de la otra con la misma
 * forma (quién, dónde, qué, cuánto), y después se agrupa por persona y
 * sucursal con `FILTER` para separar cada tipo.
 *
 * El período se filtra DENTRO de cada parte de la unión, sobre su propia columna
 * de fecha (SPEC-ALE186-021): así cada tabla usa su índice y solo sube a la unión
 * lo del período, en vez de unir las tres tablas enteras y filtrar después.
 *
 * La sucursal es la DEL REGISTRO, no la de la persona hoy (la regla de
 * SPEC-ALE186-012): a un empleado que cambió de sucursal en el período le
 * corresponden dos filas, cada una con lo que hizo ahí. Quien no hizo nada en el
 * período no aparece: no hay filas de donde sacarlo.
 */
export async function productividad(periodo: Periodo): Promise<ProductividadFila[]> {
  const { rows } = await pool.query<FilaProductividad>(
    `WITH acciones AS (
       SELECT usuario_recepcion_id AS usuario_id, sucursal_id, 'ORDEN' AS tipo, NULL::numeric AS monto
         FROM ordenes
        WHERE ${delPeriodo('fecha_entrada')}
       UNION ALL
       SELECT usuario_id, sucursal_id, 'COBRO', monto
         FROM pagos
        WHERE ${delPeriodo('fecha_pago')}
       UNION ALL
       SELECT usuario_entrega_id, sucursal_id, 'ENTREGA', NULL
         FROM entregas
        WHERE ${delPeriodo('fecha_entrega')}
     )
     SELECT u.id AS usuario_id, u.nombre_completo, s.id AS sucursal_id, s.nombre AS sucursal,
            (COUNT(*) FILTER (WHERE a.tipo = 'ORDEN'))::int                            AS ordenes_recibidas,
            (COUNT(*) FILTER (WHERE a.tipo = 'COBRO'))::int                            AS cobros,
            COALESCE(SUM(a.monto) FILTER (WHERE a.tipo = 'COBRO'), 0)::numeric(14,2)  AS monto_cobrado,
            (COUNT(*) FILTER (WHERE a.tipo = 'ENTREGA'))::int                          AS entregas
       FROM acciones a
       JOIN usuarios   u ON u.id = a.usuario_id
       JOIN sucursales s ON s.id = a.sucursal_id
      WHERE ($3::uuid IS NULL OR a.sucursal_id = $3)
      GROUP BY u.id, u.nombre_completo, s.id, s.nombre
      ORDER BY s.nombre, s.id, u.nombre_completo, u.id`,
    [periodo.desde, periodo.hasta, periodo.sucursalId, ZONA_NEGOCIO],
  );

  return rows.map((fila) => ({
    usuario: { id: fila.usuario_id, nombreCompleto: fila.nombre_completo },
    sucursal: { id: fila.sucursal_id, nombre: fila.sucursal },
    ordenesRecibidas: fila.ordenes_recibidas,
    cobros: fila.cobros,
    montoCobrado: fila.monto_cobrado,
    entregas: fila.entregas,
  }));
}

// ------------------------------------------------------------------
//  Atenciones de cada cliente — SPEC-ALE186-017
// ------------------------------------------------------------------

export interface AtencionesEnSucursal {
  sucursal: { id: string; nombre: string };
  ordenes: number;
  /** Lo que pagó de verdad, como lo suma Postgres: `"125.50"`. */
  gastado: string;
  /** `YYYY-MM-DD HH:MM:SS`, en la hora del negocio. */
  ultimaVisita: string;
}

export interface AtencionesCliente {
  cliente: { id: string; nombre: string; telefono: string };
  ordenes: number;
  gastado: string;
  ultimaVisita: string;
  porSucursal: AtencionesEnSucursal[];
}

interface FilaCliente {
  cliente_id: string;
  nombre: string;
  telefono: string;
  ordenes: number;
  gastado: string;
  ultima_visita: string;
  /** El `json_agg` de abajo, ya parseado por `pg`. */
  por_sucursal: {
    sucursal_id: string;
    sucursal: string;
    ordenes: number;
    gastado: string;
    ultima_visita: string;
  }[];
}

/**
 * Las atenciones del período, agrupadas dos veces: por cliente y sucursal, y por
 * cliente. Es la base de la página y del total, así que los dos filtran igual.
 *
 * Una atención es una orden NO anulada que entró en el período, y es de la
 * sucursal de esa orden, que no cambia nunca (la regla del registro,
 * SPEC-ALE186-012). Lo pagado sale de los pagos de cada orden, no de su precio:
 * una deuda sin cobrar no es plata gastada.
 *
 * Parámetros: $1 desde, $2 hasta, $3 sucursal, $4 zona, $5 cliente.
 */
const ATENCIONES = `atenciones AS (
    SELECT o.cliente_id, o.sucursal_id, o.fecha_entrada,
           COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = o.id), 0) AS pagado
      FROM ordenes o
     WHERE o.estado <> 'ANULADO'
       AND ${delPeriodo('o.fecha_entrada')}
       AND ($3::uuid IS NULL OR o.sucursal_id = $3)
       AND ($5::uuid IS NULL OR o.cliente_id = $5)
  ),
  por_sucursal AS (
    SELECT cliente_id, sucursal_id, COUNT(*) AS ordenes, SUM(pagado) AS gastado,
           MAX(fecha_entrada) AS ultima
      FROM atenciones
     GROUP BY cliente_id, sucursal_id
  ),
  por_cliente AS (
    SELECT cliente_id, SUM(ordenes) AS ordenes, SUM(gastado) AS gastado, MAX(ultima) AS ultima
      FROM por_sucursal
     GROUP BY cliente_id
  )`;

/**
 * Una página de clientes con atenciones, de quien más vino a quien menos, y
 * cuántos clientes hay en total.
 *
 * Las sucursales de cada cliente salen en la misma fila, como un array JSON
 * (`json_agg`): así una página de 50 clientes es una consulta, no 51. Dentro de
 * ese JSON el dinero va como TEXTO: un número en JSON llega a JavaScript como
 * float, y un float no es un monto (CLAUDE.md, sección 6).
 *
 * Son dos consultas y no un `count(*) OVER ()`, por lo mismo que en la auditoría
 * (SPEC-ALE186-012): una página más allá de la última no tendría filas sobre las
 * que contar.
 */
export async function clientes(
  periodo: Periodo,
  clienteId: string | null,
  paginacion: Paginacion,
): Promise<{ total: number; clientes: AtencionesCliente[] }> {
  const parametros = [periodo.desde, periodo.hasta, periodo.sucursalId, ZONA_NEGOCIO, clienteId];

  const { rows: conteo } = await pool.query<{ total: number }>(
    `WITH ${ATENCIONES} SELECT COUNT(*)::int AS total FROM por_cliente`,
    parametros,
  );
  const { rows } = await pool.query<FilaCliente>(
    `WITH ${ATENCIONES},
     pagina AS (
       SELECT pc.cliente_id, c.nombre, c.telefono, pc.ordenes, pc.gastado, pc.ultima
         FROM por_cliente pc
         JOIN clientes c ON c.id = pc.cliente_id
        ORDER BY pc.ordenes DESC, c.nombre, c.id
        LIMIT $6 OFFSET $7
     )
     SELECT pagina.cliente_id, pagina.nombre, pagina.telefono,
            pagina.ordenes::int AS ordenes,
            pagina.gastado::numeric(14,2) AS gastado,
            to_char(${horaDelNegocio('pagina.ultima', '$4')}, 'YYYY-MM-DD HH24:MI:SS') AS ultima_visita,
            (SELECT json_agg(json_build_object(
                      'sucursal_id', s.id,
                      'sucursal', s.nombre,
                      'ordenes', ps.ordenes,
                      'gastado', ps.gastado::numeric(14,2)::text,
                      'ultima_visita', to_char(${horaDelNegocio('ps.ultima', '$4')}, 'YYYY-MM-DD HH24:MI:SS'))
                    ORDER BY s.nombre, s.id)
               FROM por_sucursal ps
               JOIN sucursales s ON s.id = ps.sucursal_id
              WHERE ps.cliente_id = pagina.cliente_id) AS por_sucursal
       FROM pagina
      ORDER BY pagina.ordenes DESC, pagina.nombre, pagina.cliente_id`,
    [...parametros, paginacion.porPagina, salteo(paginacion)],
  );

  return {
    total: conteo[0]?.total ?? 0,
    clientes: rows.map((fila) => ({
      cliente: { id: fila.cliente_id, nombre: fila.nombre, telefono: fila.telefono },
      ordenes: fila.ordenes,
      gastado: fila.gastado,
      ultimaVisita: fila.ultima_visita,
      porSucursal: fila.por_sucursal.map((ps) => ({
        sucursal: { id: ps.sucursal_id, nombre: ps.sucursal },
        ordenes: ps.ordenes,
        gastado: ps.gastado,
        ultimaVisita: ps.ultima_visita,
      })),
    })),
  };
}
