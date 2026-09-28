// Emisión y verificación de los tokens de sesión.
//
// El proyecto reparte DOS credenciales en cada login (CLAUDE.md, sección 6):
// una para hablar con esta API y otra que verifica PowerSync para dejar bajar
// datos al dispositivo. Las dos se firman con el MISMO secreto —hay uno solo,
// el de `PS_JWT_SECRET_B64`— pero no son intercambiables, y esa diferencia es
// deliberada; está explicada en la audiencia, más abajo.
import jwt, { type SignOptions } from 'jsonwebtoken';
import { authConfig, type ConfigAuth } from '../config.js';
import { ApiError, CODIGOS_ERROR } from './ApiError.js';

export type Rol = 'ADMIN' | 'EMPLEADO';

/** Lo que el token le cuenta al backend sobre quién está pidiendo. */
export interface Sesion {
  id: string;
  rol: Rol;
  sucursalId: string | null;
}

export interface Credenciales {
  token: string;
  tokenPowerSync: string;
}

// El `kid` tiene que coincidir con el de la clave declarada en
// docker/powersync/powersync.yaml (`kid: lavanderia-dev`). PowerSync elige con
// qué clave verificar mirando esta cabecera; si no coincide, ni la intenta.
const KID_POWERSYNC = 'lavanderia-dev';

// La audiencia separa los dos tokens. PowerSync acepta solo `PS_JWT_AUDIENCE`,
// y esta API acepta solo esa misma con el sufijo. Como el secreto es único, sin
// esta distinción un token de PowerSync serviría para llamar a la API y al
// revés: la firma sería válida en los dos lados. El `aud` es lo que dice para
// qué se emitió cada uno.
const SUFIJO_API = '-api';

function audienciaApi(cfg: ConfigAuth): string {
  return `${cfg.audiencia}${SUFIJO_API}`;
}

/**
 * Firma las dos credenciales de una sesión.
 *
 * Recibe la config como argumento (con el valor real por defecto) para poder
 * probarla con secretos y plazos de mentira, igual que hace `readConfig`.
 */
export function emitirCredenciales(sesion: Sesion, cfg: ConfigAuth = authConfig): Credenciales {
  const comunes: SignOptions = {
    algorithm: 'HS256',
    subject: sesion.id,
    expiresIn: cfg.expiraEn as SignOptions['expiresIn'],
  };

  // El token de la API lleva rol y sucursal: es lo que el middleware necesita
  // para autorizar sin volver a consultar la base en cada petición.
  const token = jwt.sign({ rol: sesion.rol, sucursal_id: sesion.sucursalId }, cfg.secreto, {
    ...comunes,
    audience: audienciaApi(cfg),
  });

  // El de PowerSync va pelado a propósito. Lo único que ese servicio necesita
  // es saber QUIÉN es (`sub`, que las sync rules leen con `request.user_id()`);
  // el rol y la sucursal los saca él de la base. Mandarle claims que no usa es
  // repartir información de más a otro sistema.
  const tokenPowerSync = jwt.sign({}, cfg.secreto, {
    ...comunes,
    audience: cfg.audiencia,
    keyid: KID_POWERSYNC,
  });

  return { token, tokenPowerSync };
}

const SESION_INVALIDA =
  'No pudimos validar tu sesión. Volvé a iniciar sesión con tu usuario y contraseña.';

const SESION_VENCIDA = 'Tu sesión venció. Volvé a iniciar sesión con tu usuario y contraseña.';

function noAutenticado(mensaje: string): ApiError {
  return new ApiError(401, CODIGOS_ERROR.NO_AUTENTICADO, mensaje);
}

/**
 * Verifica un token de ESTA API y devuelve la sesión que lleva dentro.
 *
 * Todo lo que salga mal termina en el mismo 401: firma alterada, token vencido,
 * emitido para PowerSync y no para la API, o con un contenido que no es el que
 * esperamos. Quien manda un token inválido no necesita saber por qué lo es.
 */
export function verificarToken(token: string, cfg: ConfigAuth = authConfig): Sesion {
  let contenido: unknown;

  try {
    contenido = jwt.verify(token, cfg.secreto, {
      algorithms: ['HS256'],
      audience: audienciaApi(cfg),
    });
  } catch (error) {
    throw noAutenticado(error instanceof jwt.TokenExpiredError ? SESION_VENCIDA : SESION_INVALIDA);
  }

  return aSesion(contenido);
}

/**
 * Estrecha el contenido del token a una `Sesion`.
 *
 * `jwt.verify` devuelve `string | JwtPayload`: la firma es válida, pero de lo
 * que hay dentro no sabe nada. Un token viejo, emitido por una versión anterior
 * del backend, podría no traer `rol`. Se comprueba campo por campo en vez de
 * afirmar el tipo con un `as`, que es exactamente la mentira que la sección 10
 * del CLAUDE.md prohíbe.
 */
function aSesion(contenido: unknown): Sesion {
  if (typeof contenido !== 'object' || contenido === null) throw noAutenticado(SESION_INVALIDA);

  const { sub, rol, sucursal_id: sucursalId } = contenido as Record<string, unknown>;

  if (typeof sub !== 'string' || sub === '') throw noAutenticado(SESION_INVALIDA);
  if (rol !== 'ADMIN' && rol !== 'EMPLEADO') throw noAutenticado(SESION_INVALIDA);
  if (sucursalId !== null && typeof sucursalId !== 'string') throw noAutenticado(SESION_INVALIDA);

  return { id: sub, rol, sucursalId };
}
