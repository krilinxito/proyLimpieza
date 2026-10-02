// Model de sucursales. Por ahora solo lo que necesitan la semilla inicial
// (SPEC-ALE186-002) y el registro de órdenes (SPEC-ALE186-004); la gestión de
// sucursales tendrá su propia spec.
import { pool } from '../db/pool.js';

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
