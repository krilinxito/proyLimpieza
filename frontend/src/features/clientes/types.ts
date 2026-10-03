/** Un cliente tal como lo ve el mostrador. */
export type Cliente = {
  id: string;
  nombre: string;
  /** Solo dígitos: ver `normalizarTelefono`. */
  telefono: string;
  /** Opcional en el negocio: muchos clientes no lo dan. */
  carnet: string | null;
};

/** Lo que escribe el empleado en el alta, tal cual, sin limpiar. */
export type DatosAlta = {
  nombre: string;
  telefono: string;
  carnet: string;
};

/** Qué está mal en cada campo del alta, en palabras del mostrador. */
export type ErroresAlta = {
  nombre?: string;
  telefono?: string;
};

/**
 * Cómo terminó un alta. Ninguno de los tres es una excepción: son respuestas normales que
 * la pantalla tiene que mostrar. Una excepción queda para lo que de verdad salió mal (la
 * base local no pudo escribir).
 */
export type ResultadoAlta =
  | { tipo: 'registrado'; cliente: Cliente }
  | { tipo: 'invalido'; errores: ErroresAlta }
  | { tipo: 'telefono-ocupado'; cliente: Cliente };
