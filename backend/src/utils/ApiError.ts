// El formato de error uniforme de toda la API (CLAUDE.md, sección 10).
//
// Un solo shape para todos los errores, de cualquier endpoint:
//
//   { "error": { "codigo": "NO_ENCONTRADO", "mensaje": "..." } }
//
// `codigo` es para el código del frontend: estable, en mayúsculas, nunca se
// traduce ni se muestra. Es lo que deja distinguir un choque de número de
// boleta de cualquier otro conflicto sin leer el texto.
//
// `mensaje` es para la persona del mostrador. Sección 9: en español, sin
// códigos, y diciendo qué hacer. Se muestra tal cual en pantalla.

/** Códigos genéricos. Cada spec agrega los suyos de dominio. */
export const CODIGOS_ERROR = {
  VALIDACION: 'VALIDACION',
  NO_ENCONTRADO: 'NO_ENCONTRADO',
  NO_AUTENTICADO: 'NO_AUTENTICADO',
  SIN_PERMISO: 'SIN_PERMISO',
  CONFLICTO: 'CONFLICTO',
  SERVICIO_NO_DISPONIBLE: 'SERVICIO_NO_DISPONIBLE',
  ERROR_INTERNO: 'ERROR_INTERNO',
} as const;

export interface CuerpoError {
  error: {
    codigo: string;
    mensaje: string;
    detalles?: unknown;
  };
}

/**
 * Error que el manejador central sabe traducir a una respuesta HTTP.
 *
 * Cualquier otra cosa que se lance (un TypeError, un fallo de `pg`) sale como
 * 500 genérico: si no fue previsto, no hay mensaje útil que darle al usuario.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalles?: unknown;

  constructor(status: number, codigo: string, mensaje: string, detalles?: unknown) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  toBody(): CuerpoError {
    return {
      error: {
        codigo: this.codigo,
        mensaje: this.message,
        ...(this.detalles === undefined ? {} : { detalles: this.detalles }),
      },
    };
  }
}
