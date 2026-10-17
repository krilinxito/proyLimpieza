/** Una sucursal como la ve el admin — SPEC-KRILINXI-017. */
export type Sucursal = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  /** false: cerrada. No recibe ropa nueva ni personal nuevo (SPEC-ALE186-011 y -014). */
  activa: boolean;
};

/** Lo que escribe el admin en el formulario, tal cual. */
export type DatosSucursal = { nombre: string; direccion: string; telefono: string };

export type ErroresSucursal = Partial<Record<keyof DatosSucursal, string>>;

/** Cómo terminó un cambio. Ninguno es una excepción: la pantalla los muestra. */
export type ResultadoSucursal =
  | { tipo: 'guardado' }
  | { tipo: 'invalido'; errores: ErroresSucursal }
  | { tipo: 'sin-cambios' }
  | { tipo: 'rechazado'; mensaje: string }
  | { tipo: 'sin-conexion' };
