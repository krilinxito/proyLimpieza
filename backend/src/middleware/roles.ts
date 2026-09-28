// Control de acceso por rol.
//
// Sección 8 del CLAUDE.md: «Acceso solo para ADMIN, verificado en el
// middleware. Esconder el botón en la UI no es control de acceso.» Este archivo
// es ese verificado.
import type { NextFunction, Request, Response } from 'express';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { sesionDe } from './auth.js';
import type { Rol } from '../utils/jwt.js';

/**
 * Deja pasar solo a los roles indicados.
 *
 * Devuelve un middleware en vez de ser uno: así la ruta declara a quién deja
 * entrar (`requireRol('ADMIN')`) y se lee de un vistazo en el archivo de rutas.
 *
 * Se usa SIEMPRE después de `requireAuth`: sin sesión no hay rol que mirar.
 */
export function requireRol(...permitidos: Rol[]) {
  return function verificarRol(req: Request, _res: Response, next: NextFunction): void {
    const { rol } = sesionDe(req);

    if (!permitidos.includes(rol)) {
      // 403 y no 401: sabemos quién es, y no le corresponde. Un 401 le diría
      // que vuelva a iniciar sesión, y volver a iniciarla no cambiaría nada.
      throw new ApiError(
        403,
        CODIGOS_ERROR.SIN_PERMISO,
        'Esta sección es solo para el administrador.',
      );
    }

    next();
  };
}
