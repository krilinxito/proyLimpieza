import type { Rol } from '../../lib/dominio';

/**
 * Una cuenta como la ve el admin — SPEC-KRILINXI-017. Lo que baja por el bucket `global`, que
 * no trae ni la contraseña ni el teléfono (CLAUDE.md §7).
 */
export type Cuenta = {
  id: string;
  nombreCompleto: string;
  username: string;
  rol: Rol;
  /** null para un ADMIN. */
  sucursalId: string | null;
  /** El nombre de su sucursal, para la lista. */
  sucursal: string | null;
  activo: boolean;
};

export type DatosAlta = {
  nombreCompleto: string;
  username: string;
  password: string;
  rol: Rol;
  telefono: string;
  /** Solo para EMPLEADO. */
  sucursalId: string | null;
};

/** Lo que se puede cambiar. El usuario y el rol no (SPEC-ALE186-009). Vacío = no cambiar. */
export type DatosEdicion = {
  nombreCompleto: string;
  telefono: string;
  sucursalId: string | null;
  password: string;
};

export type ErroresCuenta = Partial<Record<'nombreCompleto' | 'username' | 'password' | 'sucursalId', string>>;

export type ResultadoCuenta =
  | { tipo: 'guardado' }
  | { tipo: 'invalido'; errores: ErroresCuenta }
  | { tipo: 'sin-cambios' }
  | { tipo: 'rechazado'; mensaje: string }
  | { tipo: 'sin-conexion' };
