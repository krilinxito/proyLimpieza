// Middleware de sesión: traduce el token de la cabecera en un usuario.
//
// Va delante de cualquier ruta que necesite saber quién pide. Lo que hace es
// pequeño a propósito —leer, verificar y dejar el resultado en `req`— porque se
// ejecuta en TODAS las peticiones autenticadas.
import type { NextFunction, Request, Response } from 'express';
import type { Revision } from '../models/auditoria.model.js';
import { buscarPorId } from '../models/usuarios.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { verificarToken, verificarTokenDeLaCola, type Sesion } from '../utils/jwt.js';

// Añade `req.usuario` al tipo de Express. Sin esto, TypeScript no sabe que el
// campo existe, y la alternativa sería un `as` en cada controller.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: Sesion;
      /** Si la escritura queda marcada para el admin — SPEC-ALE186-018. */
      revision?: Revision | null;
    }
  }
}

const PREFIJO = 'Bearer ';

/**
 * Exige un token válido. Deja la sesión en `req.usuario` y sigue.
 *
 * No consulta la base: todo lo que necesita está firmado dentro del token. Es
 * la razón de ser de un JWT, y también su límite — un usuario dado de baja hace
 * un rato sigue teniendo un token válido. Eso se cierra en la renovación
 * (CLAUDE.md, sección 6), que es el único punto que vuelve a mirar `activo`.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const cabecera = req.get('authorization');

  if (cabecera === undefined || !cabecera.startsWith(PREFIJO)) {
    throw new ApiError(
      401,
      CODIGOS_ERROR.NO_AUTENTICADO,
      'Necesitás iniciar sesión para hacer esto.',
    );
  }

  req.usuario = verificarToken(cabecera.slice(PREFIJO.length).trim());
  next();
}

/**
 * La sesión de una petición que ya pasó por `requireAuth`.
 *
 * El campo es opcional en el tipo —en una ruta pública no hay sesión—, así que
 * sin esto cada controller tendría que comprobarlo o mentirle al compilador con
 * un `!`. Acá se comprueba una vez: si falta, es que a la ruta se le olvidó
 * poner el middleware, y es mejor un 401 que un `undefined` recorriendo el
 * código hasta reventar en otro sitio.
 */
export function sesionDe(req: Request): Sesion {
  if (req.usuario === undefined) {
    throw new ApiError(
      401,
      CODIGOS_ERROR.NO_AUTENTICADO,
      'Necesitás iniciar sesión para hacer esto.',
    );
  }

  return req.usuario;
}

/**
 * La sesión de las rutas que sube la cola del mostrador — SPEC-ALE186-018.
 *
 * Distinta de `requireAuth` en dos cosas, y solo para `POST`/`PATCH` de clientes
 * y órdenes y `POST` de pagos y entregas:
 *
 *   1. Acepta un token vencido hace hasta 3 días (`verificarTokenDeLaCola`). Una
 *      tablet que estuvo sin internet sube lo que guardó con el token que tiene,
 *      y queda a nombre de quien lo hizo de verdad, no de quien entre después.
 *   2. Mira en la base si la cuenta sigue activa. Una cuenta dada de baja puede
 *      subir igual —es trabajo real, con clientes esperando su ropa—, pero la
 *      escritura queda marcada para que el admin la revise (`req.revision`).
 *
 * El paso 2 es una consulta más por escritura. `requireAuth` no la hace a
 * propósito, porque corre en todas las peticiones; acá vale la pena.
 */
export async function requireAuthDeLaCola(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cabecera = req.get('authorization');

  if (cabecera === undefined || !cabecera.startsWith(PREFIJO)) {
    throw new ApiError(401, CODIGOS_ERROR.NO_AUTENTICADO, 'Necesitás iniciar sesión para hacer esto.');
  }

  const sesion = verificarTokenDeLaCola(cabecera.slice(PREFIJO.length).trim());
  const usuario = await buscarPorId(sesion.id);
  if (usuario === null) {
    // No hay borrado de usuarios: un token firmado para alguien que no existe no
    // debería pasar. Si pasa, no hay a nombre de quién anotar nada.
    throw new ApiError(401, CODIGOS_ERROR.NO_AUTENTICADO, 'Necesitás iniciar sesión para hacer esto.');
  }

  req.usuario = sesion;
  req.revision = usuario.activo ? null : 'cuenta_dada_de_baja';
  next();
}

/** La marca de revisión de una petición que pasó por `requireAuthDeLaCola`. */
export function revisionDe(req: Request): Revision | null {
  return req.revision ?? null;
}
