// Model de sucursales: el único sitio que consulta la tabla `sucursales`.
//
// Empezó con lo que necesitaban la semilla (SPEC-ALE186-002) y el registro de
// órdenes (SPEC-ALE186-004). SPEC-ALE186-011 le sumó el alta y la edición desde
// la API, con las mismas reglas de escritura que clientes y usuarios: id del
// dispositivo, reintento idempotente y auditoría en la misma sentencia.
import pg from 'pg';
import { pool } from '../db/pool.js';
import { ESTADOS_CERRADOS, ESTADOS_ORDEN } from '../utils/dominio.js';
import { conAuditoria, updateConAntes } from './auditoria.model.js';

export interface Sucursal {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
}

interface FilaSucursal {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
}

const COLUMNAS = 'id, nombre, direccion, telefono, activa';

/** SPEC-ALE186-004: para validar la sucursal que indica un ADMIN al registrar. */
export async function buscarPorId(id: string): Promise<Sucursal | null> {
  const { rows } = await pool.query<FilaSucursal>(
    `SELECT ${COLUMNAS} FROM sucursales WHERE id = $1`,
    [id],
  );

  return rows[0] ?? null;
}

export async function buscarPorNombre(nombre: string): Promise<Sucursal | null> {
  const { rows } = await pool.query<FilaSucursal>(
    `SELECT ${COLUMNAS} FROM sucursales WHERE nombre = $1`,
    [nombre],
  );

  return rows[0] ?? null;
}

export async function crear(nombre: string): Promise<Sucursal> {
  const { rows } = await pool.query<FilaSucursal>(
    `INSERT INTO sucursales (nombre) VALUES ($1) RETURNING ${COLUMNAS}`,
    [nombre],
  );

  const fila = rows[0];
  if (fila === undefined) throw new Error('El INSERT de la sucursal no devolvió ninguna fila.');
  return fila;
}

// ------------------------------------------------------------------
//  Alta y edición desde la API — SPEC-ALE186-011
// ------------------------------------------------------------------

/**
 * Los estados de una orden cuya ropa todavía está en el local. Una sucursal con
 * órdenes así no se cierra: el cliente vuelve a retirarla a esa misma sucursal
 * (CLAUDE.md, sección 3).
 */
export const ESTADOS_ABIERTOS = ESTADOS_ORDEN.filter((estado) => !ESTADOS_CERRADOS.includes(estado));

// El índice único sobre `lower(btrim(nombre))` (SPEC-ALE186-020, migración 003).
// Hasta esa spec la regla vivía en el código, como condición dentro de cada
// sentencia, y dejaba pasar dos altas simultáneas; ahora la garantiza la base.
const RESTRICCION_NOMBRE = 'uq_sucursales_nombre';

/** 23505 = unique_violation, sobre el índice del nombre. */
function nombreRepetido(error: unknown): boolean {
  return error instanceof pg.DatabaseError && error.code === '23505' && error.constraint === RESTRICCION_NOMBRE;
}

/** El nombre ya lo usa otra sucursal. Error de dominio: el 409 lo decide el controller. */
export class NombreOcupadoError extends Error {
  constructor(readonly nombre: string) {
    super(`Ya hay otra sucursal que se llama ${nombre}.`);
    this.name = 'NombreOcupadoError';
  }
}

export interface SucursalNueva {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
}

/**
 * Da de alta una sucursal con el id del cliente, o devuelve la que ya existe
 * con ese id.
 *
 * `ON CONFLICT (id) DO NOTHING` hace idempotente el reintento. Solo arbitra sobre
 * el id: en un reintento chocan el id Y el nombre a la vez, y gana el id, sin
 * error. Un nombre repetido con OTRO id lo frena el índice único, que tira 23505
 * y se traduce a `NombreOcupadoError`, también si dos altas llegan a la vez.
 */
export async function registrar(
  sucursal: SucursalNueva,
  autorId: string,
): Promise<{ sucursal: Sucursal; creada: boolean }> {
  const { sql, valores } = conAuditoria(
    {
      sql: `INSERT INTO sucursales (id, nombre, direccion, telefono)
                 VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
              RETURNING ${COLUMNAS}`,
      valores: [sucursal.id, sucursal.nombre, sucursal.direccion, sucursal.telefono],
      columnas: COLUMNAS,
    },
    { usuarioId: autorId, accion: 'CREAR', tabla: 'sucursales' },
  );
  let filas: FilaSucursal[];
  try {
    filas = (await pool.query<FilaSucursal>(sql, valores)).rows;
  } catch (error) {
    if (nombreRepetido(error)) throw new NombreOcupadoError(sucursal.nombre);
    throw error;
  }

  const insertada = filas[0];
  if (insertada !== undefined) return { sucursal: insertada, creada: true };

  // No se insertó. El reintento va primero: si la sucursal con ese id ya está,
  // que el nombre "esté ocupado" es por ella misma.
  const existente = await buscarPorId(sucursal.id);
  if (existente !== null) return { sucursal: existente, creada: false };
  throw new NombreOcupadoError(sucursal.nombre);
}

/** Lo único de una sucursal que se puede cambiar. */
export interface CambiosSucursal {
  nombre?: string;
  direccion?: string | null;
  telefono?: string | null;
  activa?: boolean;
}

// Campo de TypeScript → columna. Lista cerrada: las columnas del UPDATE salen
// SOLO de acá, nunca del cuerpo de la petición.
const COLUMNA_EDITABLE: Record<keyof CambiosSucursal, string> = {
  nombre: 'nombre',
  direccion: 'direccion',
  telefono: 'telefono',
  activa: 'activa',
};

export type ResultadoActualizar =
  | { tipo: 'actualizada'; sucursal: Sucursal }
  | { tipo: 'no-encontrada' }
  | { tipo: 'nombre-ocupado' }
  /** Se pidió cerrarla y todavía tiene ropa en el local. */
  | { tipo: 'con-ropa-abierta'; cantidad: number };

/**
 * Aplica los cambios solo si se pueden aplicar.
 *
 * Las dos reglas —el nombre libre y, al cerrar, que no quede ropa en el local—
 * van como condiciones del `SELECT … FOR UPDATE` que lee la fila de antes
 * (`updateConAntes`, SPEC-ALE186-010): si no se cumplen, no se escribe ni se
 * anota nada. Solo cuando no se aplicó se averigua por qué, igual que en
 * `ordenes.actualizar`.
 */
export async function actualizar(
  id: string,
  cambios: CambiosSucursal,
  autorId: string,
): Promise<ResultadoActualizar> {
  const campos = (Object.keys(COLUMNA_EDITABLE) as (keyof CambiosSucursal)[]).filter(
    (campo) => cambios[campo] !== undefined,
  );

  if (campos.length === 0) {
    const actual = await buscarPorId(id);
    return actual === null ? { tipo: 'no-encontrada' } : { tipo: 'actualizada', sucursal: actual };
  }

  // $1 es el id; si se cierra, $2 son los estados abiertos; después, los
  // cambios. Un parámetro que no aparece en el SQL hace fallar a Postgres
  // ("could not determine data type"), por eso los estados van solo si se usan.
  const valores: unknown[] = [id];
  const condiciones = ['id = $1'];
  if (cambios.activa === false) {
    valores.push(ESTADOS_ABIERTOS);
    condiciones.push(`NOT EXISTS (SELECT 1 FROM ordenes
                                   WHERE ordenes.sucursal_id = $1
                                     AND ordenes.estado = ANY($2::estado_orden[]))`);
  }
  const desde = valores.length + 1;
  const posicion = (campo: keyof CambiosSucursal) => `$${campos.indexOf(campo) + desde}`;
  valores.push(...campos.map((campo) => cambios[campo]));

  // Cuándo se cerró (SPEC-ALE186-020): al cerrar, la hora del servidor, pero solo
  // si estaba abierta —volver a "cerrar" una cerrada no le corre la fecha, que la
  // haría más permisiva—; al reabrir, nada. En el SET, `c.activa` es el valor de
  // ANTES del cambio.
  const asignaciones = campos.map((campo) => `${COLUMNA_EDITABLE[campo]} = ${posicion(campo)}`);
  if (cambios.activa === false) asignaciones.push('cerrada_en = CASE WHEN c.activa THEN LOCALTIMESTAMP ELSE c.cerrada_en END');
  if (cambios.activa === true) asignaciones.push('cerrada_en = NULL');

  const consulta = conAuditoria(
    {
      sql: updateConAntes({
        tabla: 'sucursales',
        asignaciones,
        condiciones: condiciones.join(' AND '),
        columnas: COLUMNAS,
        auditadas: campos.map((campo) => ({ columna: COLUMNA_EDITABLE[campo] })),
      }),
      valores,
      columnas: COLUMNAS,
    },
    { usuarioId: autorId, accion: 'EDITAR', tabla: 'sucursales', conValoresAnteriores: true },
  );
  let filas: FilaSucursal[];
  try {
    filas = (await pool.query<FilaSucursal>(consulta.sql, consulta.valores)).rows;
  } catch (error) {
    if (nombreRepetido(error)) return { tipo: 'nombre-ocupado' };
    throw error;
  }

  const fila = filas[0];
  if (fila !== undefined) return { tipo: 'actualizada', sucursal: fila };

  if ((await buscarPorId(id)) === null) return { tipo: 'no-encontrada' };
  return { tipo: 'con-ropa-abierta', cantidad: await contarOrdenesAbiertas(id) };
}

/**
 * Cuántas órdenes tienen la ropa todavía en el local, para que el mensaje diga
 * cuántas quedan. Es un conteo sobre `ordenes`, pero se queda acá: es la
 * pregunta de esta tabla ("¿se puede cerrar?"), y la misma condición ya está
 * escrita en el UPDATE de arriba.
 */
async function contarOrdenesAbiertas(id: string): Promise<number> {
  const { rows } = await pool.query<{ cantidad: number }>(
    `SELECT count(*)::int AS cantidad FROM ordenes
      WHERE sucursal_id = $1 AND estado = ANY($2::estado_orden[])`,
    [id, ESTADOS_ABIERTOS],
  );
  return rows[0]?.cantidad ?? 0;
}
