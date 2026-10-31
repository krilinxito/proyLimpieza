// Model de órdenes: el único sitio que consulta la tabla `ordenes`.
//
// Sigue las dos reglas de escritura que fijó el model de clientes
// (SPEC-ALE186-003): el id lo genera el dispositivo, y un reintento de la misma
// subida no duplica ni falla. Lo nuevo acá es el estado: una orden avanza por
// una secuencia (`utils/dominio.ts`), y la regla se comprueba en el mismo UPDATE
// que la aplica, no en una consulta aparte (ver `actualizar`).
import pg from 'pg';
import { pool } from '../db/pool.js';
import type { EstadoOrden, MomentoItem } from '../utils/dominio.js';
import { formatear, type Centavos } from '../utils/money.js';
import { salteo, type Paginacion } from '../utils/paginacion.js';
import { ZONA_NEGOCIO, enElPeriodo, horaDelNegocio } from '../utils/periodo.js';
import {
  conAuditoria,
  updateConAntes,
  type ColumnaAuditada,
  type Revision,
} from './auditoria.model.js';

export interface Orden {
  id: string;
  numeroBoleta: string;
  clienteId: string;
  sucursalId: string;
  usuarioRecepcionId: string;
  descripcion: string;
  fechaEntrada: string;
  fechaEstimadaSalida: string | null;
  /** Como lo entrega Postgres: `"12.50"`. Para operar, `money.parse`. */
  precioTotal: string;
  estado: EstadoOrden;
}

interface FilaOrden {
  id: string;
  numero_boleta: string;
  cliente_id: string;
  sucursal_id: string;
  usuario_recepcion_id: string;
  descripcion: string;
  fecha_entrada: string;
  fecha_estimada_salida: string | null;
  precio_total: string;
  estado: EstadoOrden;
}

function aOrden(fila: FilaOrden): Orden {
  return {
    id: fila.id,
    numeroBoleta: fila.numero_boleta,
    clienteId: fila.cliente_id,
    sucursalId: fila.sucursal_id,
    usuarioRecepcionId: fila.usuario_recepcion_id,
    descripcion: fila.descripcion,
    fechaEntrada: fila.fecha_entrada,
    fechaEstimadaSalida: fila.fecha_estimada_salida,
    precioTotal: fila.precio_total,
    estado: fila.estado,
  };
}

const COLUMNAS =
  'id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id, descripcion, ' +
  'fecha_entrada, fecha_estimada_salida, precio_total, estado';

/**
 * El subtotal de un renglón de la boleta (`orden_items`), en SQL — SPEC-KRILINXI-068. Es la misma cuenta que `subtotal`
 * de `utils/money.ts` y de `lib/money` en la tablet: `round` de Postgres redondea la mitad hacia arriba (para positivos,
 * igual que el `+ 50` de las otras dos). Vive acá, y no en el model de los renglones, porque lo usan los tres (órdenes,
 * renglones y entregas) y los otros dos ya importan este: así no se importan en círculo.
 */
export const SUBTOTAL_SQL = (alias: string): string => `round(${alias}.cantidad * ${alias}.precio_unitario, 2)`;

// ------------------------------------------------------------------
//  Errores de dominio (el controller decide qué HTTP son)
// ------------------------------------------------------------------

/** El número de boleta ya lo usa otra orden de la misma sucursal. */
export class BoletaOcupadaError extends Error {
  constructor(readonly numeroBoleta: string) {
    super(`La boleta ${numeroBoleta} ya está usada en esta sucursal.`);
    this.name = 'BoletaOcupadaError';
  }
}

/** El `cliente_id` no corresponde a ningún cliente. */
export class ClienteInexistenteError extends Error {
  constructor(readonly clienteId: string) {
    super(`El cliente ${clienteId} no existe.`);
    this.name = 'ClienteInexistenteError';
  }
}

// Los nombres de las restricciones del schema. La del cliente no tiene nombre
// explícito, así que es el que le pone Postgres: <tabla>_<columna>_fkey.
const RESTRICCION_BOLETA = 'uq_boleta_por_sucursal';
const RESTRICCION_CLIENTE = 'ordenes_cliente_id_fkey';

// 23505 = unique_violation, 23503 = foreign_key_violation.
function violoRestriccion(error: unknown, codigo: string, restriccion: string): boolean {
  return (
    error instanceof pg.DatabaseError && error.code === codigo && error.constraint === restriccion
  );
}

async function traducirErrores<T>(
  datos: { numeroBoleta?: string; clienteId?: string },
  operacion: () => Promise<T>,
): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    if (violoRestriccion(error, '23505', RESTRICCION_BOLETA)) {
      throw new BoletaOcupadaError(datos.numeroBoleta ?? '');
    }
    if (violoRestriccion(error, '23503', RESTRICCION_CLIENTE)) {
      throw new ClienteInexistenteError(datos.clienteId ?? '');
    }
    throw error;
  }
}

// ------------------------------------------------------------------
//  Consultas
// ------------------------------------------------------------------

export async function buscarPorId(id: string): Promise<Orden | null> {
  const { rows } = await pool.query<FilaOrden>(`SELECT ${COLUMNAS} FROM ordenes WHERE id = $1`, [
    id,
  ]);
  const fila = rows[0];
  return fila === undefined ? null : aOrden(fila);
}

// ------------------------------------------------------------------
//  Historial para el admin — SPEC-KRILINXI-040
// ------------------------------------------------------------------

/** Lo que filtra el historial. `null` = ese filtro no se aplica. */
export interface FiltrosHistorial {
  /** `YYYY-MM-DD` de Bolivia, incluido. Sin ninguno de los dos, todo el historial. */
  desde: string | null;
  hasta: string | null;
  sucursalId: string | null;
  estado: EstadoOrden | null;
  /** Parte del número de boleta, del nombre del cliente o de su teléfono. */
  texto: string | null;
  /** Solo las que todavía se deben (y no están anuladas, como en `/saldos`). */
  conSaldo: boolean;
}

/** Una boleta del historial. Los montos, como los entrega Postgres: `"12.50"`. */
export interface BoletaDelHistorial {
  id: string;
  numeroBoleta: string;
  sucursal: { id: string; nombre: string };
  cliente: { id: string; nombre: string; telefono: string };
  descripcion: string;
  estado: EstadoOrden;
  /** En la hora de Bolivia, `YYYY-MM-DD HH:MM:SS`. */
  fechaEntrada: string;
  fechaEstimadaSalida: string | null;
  precioTotal: string;
  /** `null` mientras no se entregó. */
  precioFinal: string | null;
  /** Quién se llevó la ropa — SPEC-KRILINXI-060. `null` mientras no se entregó. */
  retiro: Retiro | null;
  /** Si la ropa salió sin cobrar lo que faltaba — SPEC-KRILINXI-070. `null` en cualquier otra boleta. */
  reembolso: Reembolso | null;
  pagado: string;
  saldo: string;
  /**
   * Sus renglones — SPEC-KRILINXI-068: primero los de la boleta y después los cargos al entregar, cada grupo en el
   * orden en que se escribieron. Vacío en una boleta de antes de los renglones.
   */
  renglones: RenglonDelHistorial[];
}

/** Un renglón de una boleta del historial. Los números, como texto de Postgres (`"2.50"`). */
export interface RenglonDelHistorial {
  id: string;
  momento: MomentoItem;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  /** `round(cantidad × precio unitario, 2)`, calculado por Postgres. */
  subtotal: string;
}

/** La entrega sin cobrar de una boleta REEMBOLSADA: por qué, quién la hizo y cuándo. */
export interface Reembolso {
  motivo: string;
  /** El nombre completo de quien lo registró (siempre el de la sesión, no el que mande la tablet). */
  hechoPor: string;
  /** Cuándo salió la ropa, en la hora de Bolivia: `YYYY-MM-DD HH:MM:SS`. */
  fecha: string;
}

/** Cómo se retiró la ropa. Nombre y carnet solo vienen si fue SIN_BOLETA (el schema los exige). */
export interface Retiro {
  tipo: 'CON_BOLETA' | 'SIN_BOLETA';
  nombre: string | null;
  carnet: string | null;
}

interface FilaHistorial {
  id: string;
  numero_boleta: string;
  sucursal_id: string;
  sucursal_nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  descripcion: string;
  estado: EstadoOrden;
  fecha_entrada: string;
  fecha_estimada_salida: string | null;
  precio_total: string;
  precio_final: string | null;
  tipo_retiro: 'CON_BOLETA' | 'SIN_BOLETA' | null;
  retirado_por_nombre: string | null;
  retirado_por_carnet: string | null;
  motivo_reembolso: string | null;
  reembolso_por: string | null;
  reembolso_fecha: string | null;
  pagado: string;
  saldo: string;
  renglones: RenglonDelHistorial[];
}

// Los extremos de "todo el historial" cuando falta uno de los dos bordes. Así se
// sigue usando `enElPeriodo`, que compara la columna sin tocarla (SPEC-ALE186-021).
const DESDE_SIEMPRE = "DATE '0001-01-01'";
const HASTA_SIEMPRE = "DATE '9999-12-30'";

// Parámetros: $1 desde, $2 hasta, $3 zona, $4 sucursal, $5 estado, $6 texto (LIKE),
// $7 teléfono (LIKE, o NULL si el texto no tiene dígitos), $8 solo con saldo.
//
// `vw_saldos` ya resuelve cuánto se pagó y cuánto se debe (precio_final si hubo
// entrega, precio_total si no): se cruza con `ordenes` por id, como hace `/saldos`.
// El estado no se recalcula desde `entregas`: el servidor pasa la orden a ENTREGADO
// en la misma sentencia que registra la entrega (SPEC-ALE186-006).
const HISTORIAL = `
  historial AS (
    SELECT o.id, o.numero_boleta, o.sucursal_id, s.nombre AS sucursal_nombre,
           o.cliente_id, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
           o.descripcion, o.estado, o.fecha_entrada, o.fecha_estimada_salida,
           o.precio_total, e.precio_final,
           e.tipo_retiro, e.retirado_por_nombre, e.retirado_por_carnet,
           e.motivo_reembolso, ue.nombre_completo AS reembolso_por, e.fecha_entrega AS reembolso_fecha,
           v.total_pagado::numeric(14,2)    AS pagado,
           v.saldo_pendiente::numeric(14,2) AS saldo
      FROM vw_saldos v
      JOIN ordenes o    ON o.id = v.orden_id
      JOIN sucursales s ON s.id = o.sucursal_id
      JOIN clientes c   ON c.id = o.cliente_id
      LEFT JOIN entregas e ON e.orden_id = o.id
      LEFT JOIN usuarios ue ON ue.id = e.usuario_entrega_id
     WHERE ($1::date IS NULL AND $2::date IS NULL
            OR ${enElPeriodo('o.fecha_entrada', {
              desde: `COALESCE($1::date, ${DESDE_SIEMPRE})`,
              hasta: `COALESCE($2::date, ${HASTA_SIEMPRE})`,
              zona: '$3',
            })})
       AND ($4::uuid IS NULL OR o.sucursal_id = $4)
       AND ($5::estado_orden IS NULL OR o.estado = $5)
       AND ($6::text IS NULL
            OR o.numero_boleta ILIKE $6
            OR c.nombre ILIKE $6
            OR ($7::text IS NOT NULL AND c.telefono LIKE $7))
       AND (NOT $8::boolean OR (o.estado <> 'ANULADO' AND v.saldo_pendiente > 0))
  )`;

/**
 * Los renglones de cada boleta de la página, como un arreglo JSON — SPEC-KRILINXI-068.
 *
 * Es una subconsulta por fila del `SELECT` de la página, no una consulta aparte por boleta: Postgres la resuelve en la
 * misma consulta, con `idx_orden_items_orden`, y solo para las boletas de la página (el `LIMIT` ya se aplicó). Los
 * números salen con `::text`: dentro de un JSON, un NUMERIC sería un número, y al leerlo en JavaScript, un float.
 */
const RENGLONES = `COALESCE((
              SELECT json_agg(json_build_object(
                       'id', i.id,
                       'momento', i.momento,
                       'descripcion', i.descripcion,
                       'cantidad', i.cantidad::text,
                       'precioUnitario', i.precio_unitario::text,
                       'subtotal', ${SUBTOTAL_SQL('i')}::text
                     ) ORDER BY i.momento, i.posicion, i.id)
                FROM orden_items i
               WHERE i.orden_id = historial.id
            ), '[]'::json) AS renglones`;

/** Un texto escrito por una persona, como patrón de `LIKE`: `%`, `_` y `\` valen por sí mismos. */
function contiene(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, '\\$&')}%`;
}

function parametrosDelHistorial(filtros: FiltrosHistorial): unknown[] {
  const digitos = filtros.texto?.replace(/\D/g, '') ?? '';
  return [
    filtros.desde,
    filtros.hasta,
    ZONA_NEGOCIO,
    filtros.sucursalId,
    filtros.estado,
    filtros.texto === null ? null : contiene(filtros.texto),
    digitos === '' ? null : `%${digitos}%`,
    filtros.conSaldo,
  ];
}

/**
 * Una página del historial de boletas, de la más nueva a la más vieja, con su
 * saldo ya calculado, y cuántas cumplen los filtros en total. Solo lee.
 *
 * Son dos consultas y no un `count(*) OVER ()`, por la misma razón que en la
 * auditoría: una página más allá de la última no tiene filas sobre las que contar.
 */
export async function listar(
  filtros: FiltrosHistorial,
  paginacion: Paginacion,
): Promise<{ total: number; boletas: BoletaDelHistorial[] }> {
  const parametros = parametrosDelHistorial(filtros);

  const { rows: conteo } = await pool.query<{ total: number }>(
    `WITH ${HISTORIAL} SELECT count(*)::int AS total FROM historial`,
    parametros,
  );
  const { rows } = await pool.query<FilaHistorial>(
    `WITH ${HISTORIAL}
     SELECT id, numero_boleta, sucursal_id, sucursal_nombre, cliente_id, cliente_nombre, cliente_telefono,
            descripcion, estado,
            to_char(${horaDelNegocio('fecha_entrada', '$3')}, 'YYYY-MM-DD HH24:MI:SS') AS fecha_entrada,
            to_char(fecha_estimada_salida, 'YYYY-MM-DD') AS fecha_estimada_salida,
            precio_total, precio_final, tipo_retiro, retirado_por_nombre, retirado_por_carnet, motivo_reembolso,
            reembolso_por,
            to_char(${horaDelNegocio('reembolso_fecha', '$3')}, 'YYYY-MM-DD HH24:MI:SS') AS reembolso_fecha,
            pagado, saldo,
            ${RENGLONES}
       FROM historial
      ORDER BY historial.fecha_entrada DESC, id DESC
      LIMIT $9 OFFSET $10`,
    [...parametros, paginacion.porPagina, salteo(paginacion)],
  );

  return {
    total: conteo[0]?.total ?? 0,
    boletas: rows.map((fila) => ({
      id: fila.id,
      numeroBoleta: fila.numero_boleta,
      sucursal: { id: fila.sucursal_id, nombre: fila.sucursal_nombre },
      cliente: { id: fila.cliente_id, nombre: fila.cliente_nombre, telefono: fila.cliente_telefono },
      descripcion: fila.descripcion,
      estado: fila.estado,
      fechaEntrada: fila.fecha_entrada,
      fechaEstimadaSalida: fila.fecha_estimada_salida,
      precioTotal: fila.precio_total,
      precioFinal: fila.precio_final,
      retiro:
        fila.tipo_retiro === null
          ? null
          : { tipo: fila.tipo_retiro, nombre: fila.retirado_por_nombre, carnet: fila.retirado_por_carnet },
      reembolso:
        fila.motivo_reembolso === null
          ? null
          : {
              motivo: fila.motivo_reembolso,
              hechoPor: fila.reembolso_por ?? '',
              fecha: fila.reembolso_fecha ?? '',
            },
      pagado: fila.pagado,
      saldo: fila.saldo,
      renglones: fila.renglones,
    })),
  };
}

export interface OrdenNueva {
  id: string;
  numeroBoleta: string;
  clienteId: string;
  sucursalId: string;
  usuarioRecepcionId: string;
  descripcion: string;
  precioTotal: Centavos;
  fechaEstimadaSalida: string | null;
  /** ISO 8601 con zona, tal como lo manda el dispositivo; `null` = ahora. */
  fechaEntrada: string | null;
}

/**
 * Crea la orden en RECIBIDO, o devuelve la que ya existe con ese id.
 *
 * Igual que en clientes, `ON CONFLICT (id) DO NOTHING` hace idempotente el
 * reintento, y solo arbitra sobre el id: una boleta repetida con OTRO id sigue
 * tirando su error de unicidad, porque eso no es un reintento, es otra orden.
 *
 * `fecha_entrada` pasa por `timestamptz` antes de llegar a la columna. Así el
 * instante que mandó el dispositivo (con su zona) se convierte a la zona de la
 * sesión de Postgres, que es la misma con la que `LOCALTIMESTAMP` —el valor
 * cuando no viene— y el `DEFAULT NOW()` del schema escriben las demás filas.
 */
/**
 * Cuánto puede adelantarse el reloj de una tablet antes de que su `fecha_entrada`
 * se considere imposible — SPEC-ALE186-014. Es una red de seguridad: la hora de
 * la tablet se corrige antes, en el dispositivo; esto frena lo que se escape.
 */
export const MARGEN_FECHA_FUTURA = '5 minutes';

/** La sucursal está dada de baja y la orden es de después — SPEC-ALE186-014. */
export class SucursalCerradaError extends Error {
  constructor(readonly sucursalId: string) {
    super(`La sucursal ${sucursalId} está cerrada.`);
    this.name = 'SucursalCerradaError';
  }
}

/** La `fecha_entrada` está en el futuro respecto de la hora del servidor — SPEC-ALE186-014. */
export class FechaFuturaError extends Error {
  constructor(readonly fechaEntrada: string) {
    super(`La fecha de entrada ${fechaEntrada} está en el futuro.`);
    this.name = 'FechaFuturaError';
  }
}

/**
 * Crea la orden en RECIBIDO, o devuelve la que ya existe con ese id.
 *
 * Es un `INSERT … SELECT … FROM sucursales` (el mismo recurso que pagos usa con
 * la orden anulada, SPEC-ALE186-005): si la fila de la sucursal no cumple las
 * condiciones, el SELECT no devuelve nada y no se inserta nada. Dos reglas
 * viven ahí, en la misma sentencia que escribe — SPEC-ALE186-014:
 *
 *   - Una sucursal cerrada solo recibe la ropa que entró ANTES del cierre: la
 *     que una tablet cargó sin internet y sube después. Sin `fecha_entrada` no
 *     se puede saber, así que no entra.
 *   - Ninguna `fecha_entrada` puede estar más de `MARGEN_FECHA_FUTURA` adelante
 *     de la hora del servidor (`now()` de Postgres).
 *
 * `fecha_entrada` pasa por `timestamptz` antes de llegar a la columna, igual
 * que antes: el instante que mandó el dispositivo se convierte a la zona de la
 * sesión de Postgres, la misma con que se escriben las demás fechas, incluida
 * `sucursales.cerrada_en`. Por eso se puede comparar con el cierre sin convertir
 * nada. Hasta SPEC-ALE186-020 el cierre se deducía de la auditoría; ahora es una
 * columna, y una cerrada sin fecha conocida (NULL) no acepta nada: `x < NULL` no
 * es verdadero.
 */
export async function crear(
  orden: OrdenNueva,
  /** Si la escritura queda marcada para el admin (SPEC-ALE186-018). */
  revision: Revision | null = null,
): Promise<{ orden: Orden; creada: boolean }> {
  // Quien la recibe es quien la crea: la auditoría (SPEC-ALE186-010) se anota a
  // su nombre, en la misma sentencia, y solo si el INSERT insertó.
  const { sql, valores } = conAuditoria(
    {
      sql: `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id,
                                 descripcion, precio_total, fecha_estimada_salida, fecha_entrada)
            SELECT $1, $2, $3, s.id, $5, $6, $7, $8,
                   COALESCE($9::timestamptz::timestamp, LOCALTIMESTAMP)
              FROM sucursales s
             WHERE s.id = $4::uuid
               AND ($9::timestamptz IS NULL OR $9::timestamptz <= now() + $10::interval)
               AND (s.activa
                    OR ($9::timestamptz IS NOT NULL
                        AND $9::timestamptz::timestamp < s.cerrada_en))
            ON CONFLICT (id) DO NOTHING
            RETURNING ${COLUMNAS}`,
      valores: [
        orden.id,
        orden.numeroBoleta,
        orden.clienteId,
        orden.sucursalId,
        orden.usuarioRecepcionId,
        orden.descripcion,
        formatear(orden.precioTotal),
        orden.fechaEstimadaSalida,
        orden.fechaEntrada,
        MARGEN_FECHA_FUTURA,
      ],
      columnas: COLUMNAS,
    },
    { usuarioId: orden.usuarioRecepcionId, accion: 'CREAR', tabla: 'ordenes', revision },
  );
  const { rows } = await traducirErrores(orden, () => pool.query<FilaOrden>(sql, valores));

  const insertada = rows[0];
  if (insertada !== undefined) return { orden: aOrden(insertada), creada: true };

  // No se insertó. El reintento va primero: una orden que ya estaba guardada se
  // devuelve aunque la sucursal se haya cerrado después. Un reintento no es una
  // orden nueva.
  const existente = await buscarPorId(orden.id);
  if (existente !== null) return { orden: existente, creada: false };

  throw await motivoDelRechazo(orden);
}

/** Por qué el INSERT de `crear` no insertó, sabiendo que no fue un reintento. */
async function motivoDelRechazo(orden: OrdenNueva): Promise<Error> {
  const { rows } = await pool.query<{ futura: boolean; activa: boolean | null }>(
    `SELECT ($1::timestamptz IS NOT NULL AND $1::timestamptz > now() + $2::interval) AS futura,
            (SELECT activa FROM sucursales WHERE id = $3::uuid) AS activa`,
    [orden.fechaEntrada, MARGEN_FECHA_FUTURA, orden.sucursalId],
  );
  const motivo = rows[0];
  if (motivo?.futura === true) return new FechaFuturaError(orden.fechaEntrada ?? '');
  if (motivo?.activa === false) return new SucursalCerradaError(orden.sucursalId);

  // La sucursal existe, está abierta y la fecha es válida, pero no se insertó:
  // no debería pasar. Mejor enterarse que inventar un motivo.
  return new Error(`La orden ${orden.id} no se insertó y no se encuentra el motivo.`);
}

/** Lo único de una orden que se puede cambiar. */
export interface CambiosOrden {
  numeroBoleta?: string;
  descripcion?: string;
  precioTotal?: Centavos;
  fechaEstimadaSalida?: string | null;
  estado?: EstadoOrden;
}

// Campo en TypeScript → columna. Las columnas del UPDATE salen SOLO de acá,
// nunca del cuerpo de la petición (mismo criterio que en clientes).
const COLUMNA_EDITABLE: Record<keyof CambiosOrden, string> = {
  numeroBoleta: 'numero_boleta',
  descripcion: 'descripcion',
  precioTotal: 'precio_total',
  fechaEstimadaSalida: 'fecha_estimada_salida',
  estado: 'estado',
};

function valorDeColumna(campo: keyof CambiosOrden, cambios: CambiosOrden): unknown {
  const valor = cambios[campo];
  // El dinero se manda a Postgres como el string decimal, nunca como float.
  return campo === 'precioTotal' && typeof valor === 'number' ? formatear(valor) : valor;
}

function columnaAuditada(campo: keyof CambiosOrden): ColumnaAuditada {
  // El precio se guarda en la auditoría como "45.50", igual que sale de la API.
  return { columna: COLUMNA_EDITABLE[campo], comoTexto: campo === 'precioTotal' };
}

export interface Restricciones {
  /** La orden solo se toca si está en uno de estos estados. */
  estadosDeOrigen: readonly EstadoOrden[];
  /** Si no es `null`, la orden solo se toca si es de esta sucursal. */
  sucursalId: string | null;
}

export type ResultadoActualizar =
  | { tipo: 'actualizada'; orden: Orden }
  | { tipo: 'no-encontrada' }
  /** Existe y es visible, pero su estado actual no admite el cambio. */
  | { tipo: 'estado-no-admitido'; orden: Orden };

/**
 * Aplica los cambios solo si la orden cumple las restricciones.
 *
 * Las condiciones van dentro de la misma sentencia que escribe, no en una
 * consulta previa. Si se leyera primero el estado y se escribiera después, entre
 * las dos otra petición podría anular la orden, y esta la dejaría en otro estado igual.
 * En una sola sentencia, Postgres bloquea la fila mientras la evalúa y la
 * escribe: o cumple y se aplica, o no se aplica. Desde SPEC-ALE186-010 esas
 * condiciones viven en el `SELECT … FOR UPDATE` que lee la fila de antes (ver
 * `updateConAntes`), que es el mismo bloqueo con un paso más: deja leer qué
 * había, para la auditoría.
 *
 * Solo cuando no se aplicó se vuelve a leer, para distinguir "no existe (o no
 * es tuya)" de "existe, pero no está en un estado que lo permita".
 */
export async function actualizar(
  id: string,
  cambios: CambiosOrden,
  restricciones: Restricciones,
  autorId: string,
  /** Si la escritura queda marcada para el admin (SPEC-ALE186-018). */
  revision: Revision | null = null,
): Promise<ResultadoActualizar> {
  const campos = (Object.keys(COLUMNA_EDITABLE) as (keyof CambiosOrden)[]).filter(
    (campo) => cambios[campo] !== undefined,
  );

  // Los tres primeros parámetros son las condiciones; los cambios, desde $4.
  const asignaciones = campos.map((campo, i) => `${COLUMNA_EDITABLE[campo]} = $${i + 4}`);
  const condiciones = `id = $1 AND estado = ANY($2::estado_orden[])
                       AND ($3::uuid IS NULL OR sucursal_id = $3)`;
  const parametros = [id, restricciones.estadosDeOrigen, restricciones.sucursalId];

  // Un PATCH sin nada que cambiar no escribe (ni se audita), pero responde igual
  // que uno que sí: con la orden, si es visible para quien la pide.
  const valores = [...parametros, ...campos.map((c) => valorDeColumna(c, cambios))];
  const consulta =
    campos.length === 0
      ? { sql: `SELECT ${COLUMNAS} FROM ordenes WHERE ${condiciones}`, valores }
      : conAuditoria(
          {
            sql: updateConAntes({
              tabla: 'ordenes',
              asignaciones,
              condiciones,
              columnas: COLUMNAS,
              auditadas: campos.map((campo) => columnaAuditada(campo)),
            }),
            valores,
            columnas: COLUMNAS,
          },
          // Avanzar y anular también son EDITAR: lo que cambió es `estado`, y
          // su valor anterior queda en `valores_anteriores`.
          { usuarioId: autorId, accion: 'EDITAR', tabla: 'ordenes', conValoresAnteriores: true, revision },
        );

  const { rows } = await traducirErrores(cambios, () => pool.query<FilaOrden>(consulta.sql, consulta.valores));

  const fila = rows[0];
  if (fila !== undefined) return { tipo: 'actualizada', orden: aOrden(fila) };

  const actual = await buscarPorId(id);
  const visible =
    actual !== null && (restricciones.sucursalId === null || actual.sucursalId === restricciones.sucursalId);
  return visible ? { tipo: 'estado-no-admitido', orden: actual } : { tipo: 'no-encontrada' };
}
