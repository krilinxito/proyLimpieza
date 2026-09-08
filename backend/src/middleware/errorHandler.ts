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
    'Esa dirección no existe en el sistema. Verificá el enlace o volvé al inicio.',
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
  console.error('[error no controlado]', err);

  const generico = new ApiError(
    500,
    CODIGOS_ERROR.ERROR_INTERNO,
    'Ocurrió un problema en el sistema. Volvé a intentarlo; si sigue igual, avisá al encargado.',
  );

  res.status(generico.status).json(generico.toBody());
}
