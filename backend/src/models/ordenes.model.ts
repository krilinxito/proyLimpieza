// Model de órdenes: el único sitio que consulta la tabla `ordenes`.
//
// Sigue las dos reglas de escritura que fijó el model de clientes
// (SPEC-ALE186-003): el id lo genera el dispositivo, y un reintento de la misma
// subida no duplica ni falla. Lo nuevo acá es el estado: una orden avanza por
// una secuencia (`utils/dominio.ts`), y la regla se comprueba en el mismo UPDATE
// que la aplica, no en una consulta aparte (ver `actualizar`).
import pg from 'pg';
import { pool } from '../db/pool.js';
import type { EstadoOrden } from '../utils/dominio.js';
import { formatear, type Centavos } from '../utils/money.js';
import {
  conAuditoria,
  momentoDelCierre,
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

/** El momento en que se cerró la sucursal de la orden (`$4`); lo sabe la auditoría. */
const CIERRE_DE_LA_SUCURSAL = momentoDelCierre('$4');

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
 * `auditoria.fecha`. Por eso se puede comparar con el cierre sin convertir nada.
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
                        AND $9::timestamptz::timestamp < ${CIERRE_DE_LA_SUCURSAL}))
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
 * las dos otra petición podría anular la orden, y esta la pasaría a LISTO igual.
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
