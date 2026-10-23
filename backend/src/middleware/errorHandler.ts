// Manejo centralizado de errores.
//
// Van al final de la cadena de middlewares, después de todas las rutas: Express
// los recorre en orden, así que si ninguna ruta respondió, el que sigue es el 404.
import type { NextFunction, Request, Response } from 'express';
import { ApiError, CODIGOS_ERROR, type CuerpoError } from '../utils/ApiError.js';

/** Ninguna ruta coincidió con la petición. */
export function notFoundHandler(_req: Request, res: Response): void {
  const error = new ApiError(
    404,
    CODIGOS_ERROR.NO_ENCONTRADO,
    'Esa dirección no existe en el sistema. Verifica el enlace o vuelve al inicio.',
  );
  res.status(error.status).json(error.toBody());
}

/**
 * Traduce cualquier error a la respuesta uniforme.
 *
 * Los CUATRO parámetros son obligatorios aunque `_next` no se use: Express
 * distingue un manejador de errores de un middleware normal contando los
 * argumentos de la función. Con tres, esto sería un middleware más y los
 * errores quedarían sin atender.
 */
/** Lo que se copia de un error al log. Lista blanca: ver `paraElLog`. */
const CAMPOS_SEGUROS = ['name', 'message', 'code', 'constraint', 'table', 'stack'] as const;

/**
 * La versión de un error que se puede escribir en el log — SPEC-ALE186-023.
 *
 * Un error de Postgres trae en `detail` los valores de la fila que chocó
 * ("Key (telefono)=(71234567) already exists."), y en `where` o en los
 * parámetros, datos de la consulta. Los logs se leen, se copian y se guardan
 * por meses con menos cuidado que la base: un teléfono o un carnet ahí es un
 * dato personal fuera de control.
 *
 * Por eso se copia una LISTA BLANCA de campos, y no se borran los peligrosos:
 * si una versión futura de `pg` agrega un campo nuevo con datos, no se cuela.
 * Con `code`, `constraint` y `table` alcanza para saber qué falló; para ver
 * con qué valores, está la base, con sus permisos.
 */
export function paraElLog(err: unknown): Record<string, unknown> | string {
  if (!(err instanceof Error)) return String(err);

  const seguro: Record<string, unknown> = {};
  for (const campo of CAMPOS_SEGUROS) {
    const valor: unknown = Reflect.get(err, campo);
    if (valor !== undefined) seguro[campo] = valor;
  }
  return seguro;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<CuerpoError>,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json(err.toBody());
    return;
  }

  // Error no previsto. El detalle va al log del servidor, donde lo ve quien
  // mantiene el sistema; al cliente le llega solo el mensaje genérico. Un stack
  // trace en la respuesta le cuenta a cualquiera cómo está hecha la API por
  // dentro, y a la persona del mostrador no le sirve de nada.
  console.error('[error no controlado]', paraElLog(err));

  const generico = new ApiError(
    500,
    CODIGOS_ERROR.ERROR_INTERNO,
    'Ocurrió un problema en el sistema. Vuelve a intentarlo; si sigue igual, avisa al encargado.',
  );

  res.status(generico.status).json(generico.toBody());
}
