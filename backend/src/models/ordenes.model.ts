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
export async function crear(orden: OrdenNueva): Promise<{ orden: Orden; creada: boolean }> {
  const { rows } = await traducirErrores(orden, () =>
    pool.query<FilaOrden>(
      `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id,
                            descripcion, precio_total, fecha_estimada_salida, fecha_entrada)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                    COALESCE($9::timestamptz::timestamp, LOCALTIMESTAMP))
       ON CONFLICT (id) DO NOTHING
         RETURNING ${COLUMNAS}`,
      [
        orden.id,
        orden.numeroBoleta,
        orden.clienteId,
        orden.sucursalId,
        orden.usuarioRecepcionId,
        orden.descripcion,
        formatear(orden.precioTotal),
        orden.fechaEstimadaSalida,
        orden.fechaEntrada,
      ],
    ),
  );

  const insertada = rows[0];
  if (insertada !== undefined) return { orden: aOrden(insertada), creada: true };

  const existente = await buscarPorId(orden.id);
  if (existente === null) {
    // Chocó por id y el id no está: no hay borrado de órdenes, así que esto no
    // debería pasar nunca. Mejor enterarse que inventar una respuesta.
    throw new Error(`La orden ${orden.id} chocó por id pero no se encuentra.`);
  }
  return { orden: existente, creada: false };
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
 * Las condiciones van dentro del WHERE del UPDATE, no en un SELECT previo. Si
 * se leyera primero el estado y se escribiera después, entre las dos consultas
 * otra petición podría anular la orden, y esta la pasaría a LISTO igual. En una
 * sola sentencia, Postgres bloquea la fila mientras la evalúa y la escribe: o
 * cumple y se aplica, o no se aplica.
 *
 * Solo cuando no se aplicó se vuelve a leer, para distinguir "no existe (o no
 * es tuya)" de "existe, pero no está en un estado que lo permita".
 */
export async function actualizar(
  id: string,
  cambios: CambiosOrden,
  restricciones: Restricciones,
): Promise<ResultadoActualizar> {
  const campos = (Object.keys(COLUMNA_EDITABLE) as (keyof CambiosOrden)[]).filter(
    (campo) => cambios[campo] !== undefined,
  );

  // Los tres primeros parámetros son las condiciones; los cambios, desde $4.
  const asignaciones = campos.map((campo, i) => `${COLUMNA_EDITABLE[campo]} = $${i + 4}`);
  const condiciones = `id = $1 AND estado = ANY($2::estado_orden[])
                       AND ($3::uuid IS NULL OR sucursal_id = $3)`;
  const parametros = [id, restricciones.estadosDeOrigen, restricciones.sucursalId];

  // Un PATCH sin nada que cambiar no escribe, pero responde igual que uno que
  // sí: con la orden, si es visible para quien la pide.
  const sql =
    campos.length === 0
      ? `SELECT ${COLUMNAS} FROM ordenes WHERE ${condiciones}`
      : `UPDATE ordenes SET ${asignaciones.join(', ')} WHERE ${condiciones} RETURNING ${COLUMNAS}`;

  const { rows } = await traducirErrores(cambios, () =>
    pool.query<FilaOrden>(sql, [...parametros, ...campos.map((c) => valorDeColumna(c, cambios))]),
  );

  const fila = rows[0];
  if (fila !== undefined) return { tipo: 'actualizada', orden: aOrden(fila) };

  const actual = await buscarPorId(id);
  const visible =
    actual !== null && (restricciones.sucursalId === null || actual.sucursalId === restricciones.sucursalId);
  return visible ? { tipo: 'estado-no-admitido', orden: actual } : { tipo: 'no-encontrada' };
}
