// Controller de autenticación. Orquesta: valida la entrada, llama al model y
// arma la respuesta. No escribe SQL (CLAUDE.md, sección 5).
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import * as auditoria from '../models/auditoria.model.js';
import { buscarPorId, buscarPorUsername, type Usuario } from '../models/usuarios.model.js';
import { sesionDe } from '../middleware/auth.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { emitirCredenciales } from '../utils/jwt.js';

// Un único mensaje para "no existe ese usuario" y para "la contraseña no es
// esa". Decir cuál de las dos falló convierte el login en un buscador de
// usuarios válidos: probando nombres, cualquiera arma la lista del personal.
const CREDENCIALES_INVALIDAS = 'El usuario o la contraseña no coinciden. Volvé a intentarlo.';

const USUARIO_DADO_DE_BAJA =
  'Tu usuario está desactivado. Pedile al encargado que lo active para poder entrar.';

// Hash de una contraseña que no es de nadie. Ver `verificarContrasena`.
const HASH_SENUELO = '$2b$10$ypHkIMXL.Y1pI.U5MdNKxewUM0QOv.FX4UWOQCD6Nsi1Aiwp4RGaG';

function noAutenticado(mensaje: string): ApiError {
  return new ApiError(401, CODIGOS_ERROR.NO_AUTENTICADO, mensaje);
}

/**
 * Compara la contraseña contra el hash guardado.
 *
 * Cuando el usuario no existe igual se hace una comparación, contra un hash
 * señuelo, y se descarta el resultado. Parece trabajo tirado y es justo lo
 * contrario: `bcrypt.compare` tarda ~100 ms a propósito, así que saltárselo
 * haría que el login de un usuario inexistente respondiera mucho más rápido
 * que el de uno real. Esa diferencia de tiempo es la misma pista que el
 * mensaje único quiere tapar.
 */
async function verificarContrasena(contrasena: string, hash: string | null): Promise<boolean> {
  const coincide = await bcrypt.compare(contrasena, hash ?? HASH_SENUELO);
  return hash === null ? false : coincide;
}

/** Lo que de un usuario puede salir por la API. Lista blanca, no `delete`. */
function paraRespuesta(usuario: Usuario) {
  return {
    id: usuario.id,
    nombreCompleto: usuario.nombreCompleto,
    username: usuario.username,
    rol: usuario.rol,
    sucursalId: usuario.sucursalId,
  };
}

function leerCredenciales(body: unknown): { username: string; contrasena: string } {
  const datos = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const username = typeof datos.username === 'string' ? datos.username.trim() : '';
  const contrasena = typeof datos.password === 'string' ? datos.password : '';

  if (username === '' || contrasena === '') {
    throw new ApiError(
      400,
      CODIGOS_ERROR.VALIDACION,
      'Escribí tu usuario y tu contraseña para entrar.',
    );
  }

  return { username, contrasena };
}

/** POST /api/auth/login */
export async function postLogin(req: Request, res: Response): Promise<void> {
  const { username, contrasena } = leerCredenciales(req.body);

  const usuario = await buscarPorUsername(username);

  if (!(await verificarContrasena(contrasena, usuario?.passwordHash ?? null))) {
    throw noAutenticado(CREDENCIALES_INVALIDAS);
  }

  // El orden importa: primero la contraseña, después el estado. Al revés, quien
  // solo sabe el nombre de un empleado dado de baja se enteraría de que existe.
  // Así, ese mensaje solo lo ve quien ya demostró ser esa persona.
  if (usuario === null || !usuario.activo) throw noAutenticado(USUARIO_DADO_DE_BAJA);

  // Solo el login que entra (SPEC-ALE186-010). Los fallidos no: `usuario_id` no
  // admite NULL y un username inventado no es de nadie. La renovación tampoco:
  // pasa en cada reconexión y llenaría la tabla de ruido sin decir nada nuevo.
  await auditoria.registrar({ usuarioId: usuario.id, accion: 'LOGIN', tabla: 'usuarios', registroId: usuario.id });

  res.json({
    ...emitirCredenciales({ id: usuario.id, rol: usuario.rol, sucursalId: usuario.sucursalId }),
    usuario: paraRespuesta(usuario),
  });
}

/**
 * POST /api/auth/renovar
 *
 * El punto donde la baja de un empleado se hace efectiva. El token vale 3 días
 * sin hablar con nadie; acá es donde el servidor vuelve a tener la palabra, así
 * que es acá donde se comprueba contra la base que el usuario siga activo y se
 * releen su rol y su sucursal, por si cambiaron.
 */
export async function postRenovar(req: Request, res: Response): Promise<void> {
  const sesion = sesionDe(req);
  const usuario = await buscarPorId(sesion.id);

  if (usuario === null || !usuario.activo) throw noAutenticado(USUARIO_DADO_DE_BAJA);

  res.json({
    ...emitirCredenciales({ id: usuario.id, rol: usuario.rol, sucursalId: usuario.sucursalId }),
    usuario: paraRespuesta(usuario),
  });
}
