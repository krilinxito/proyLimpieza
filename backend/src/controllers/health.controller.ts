// Controller: orquesta. Llama al model y arma la respuesta HTTP.
// Nunca escribe SQL (CLAUDE.md, sección 5).
import type { Request, Response } from 'express';
import { estaDisponible } from '../models/health.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';

export async function getHealth(_req: Request, res: Response): Promise<void> {
  if (!(await estaDisponible())) {
    // 503 y no 500: el servicio existe y funciona, lo que falta es la base.
    // Es la diferencia entre "está roto" y "no está disponible ahora mismo".
    throw new ApiError(
      503,
      CODIGOS_ERROR.SERVICIO_NO_DISPONIBLE,
      'No hay conexión con la base de datos. Revisá que el servidor esté encendido.',
    );
  }

  res.json({ estado: 'ok', baseDeDatos: 'conectada' });
}
