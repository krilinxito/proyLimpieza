// Controller de usuarios — SPEC-ALE186-009. Valida la entrada, llama al model y
// arma la respuesta. No escribe SQL (CLAUDE.md, sección 5).
//
// Solo ADMIN, y eso lo decide la ruta con `requireRol`, no este archivo.
//
// No hay GET: la tabla `usuarios` ya baja a todos los dispositivos por el bucket
// `global`, sin `password_hash` (sección 7). Tampoco hay DELETE: una cuenta se
// da de baja con `activo: false`, porque órdenes, pagos y entregas siguen
// apuntando a quien las registró, y un borrado dejaría esas filas sin dueño.
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { sesionDe } from '../middleware/auth.js';
import * as sucursales from '../models/sucursales.model.js';
import * as usuarios from '../models/usuarios.model.js';
import { UsernameOcupadoError, type CambiosUsuario, type Usuario } from '../models/usuarios.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import type { Rol } from '../utils/jwt.js';
import {
  LARGO_MINIMO_CONTRASENA,
  comoObjeto,
  contrasenaValida,
  esUuid,
  textoHasta,
} from '../utils/validacion.js';

// El mismo coste que usa la semilla (`db/seed.ts`). El login compara con
// `bcrypt.compare`, que lee el coste del propio hash, así que cualquiera de los
// dos sirve para entrar; se mantienen iguales para que ninguna cuenta quede más
// barata de atacar que otra.
const COSTE_BCRYPT = 10;

// Los largos de las columnas en el schema (`VARCHAR(n)`).
const MAX_NOMBRE = 150;
const MAX_USERNAME = 50;
const MAX_TELEFONO = 30;

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

function leerNombre(valor: unknown): string {
  const nombre = textoHasta(valor, MAX_NOMBRE);
  if (nombre === null) {
    throw invalido(`Escribí el nombre y apellido de la persona (hasta ${MAX_NOMBRE} letras).`);
  }
  return nombre;
}

function leerUsername(valor: unknown): string {
  const username = textoHasta(valor, MAX_USERNAME);
  if (username === null) {
    throw invalido(`Escribí el nombre de usuario con el que va a entrar (hasta ${MAX_USERNAME} letras).`);
  }
  return username;
}

function leerContrasena(valor: unknown): string {
  const contrasena = contrasenaValida(valor);
  if (contrasena === null) {
    throw invalido(
      `La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres ` +
        '(y no más de 72). Elegí otra.',
    );
  }
  return contrasena;
}

/** Opcional: ausente, `null` o vacío se guarda como NULL. */
function leerTelefono(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const telefono = textoHasta(valor, MAX_TELEFONO);
  if (telefono === null) throw invalido(`Revisá el teléfono: puede tener hasta ${MAX_TELEFONO} caracteres.`);
  return telefono;
}

/** Sin rol en el cuerpo, la cuenta es de EMPLEADO: es lo que se crea casi siempre. */
function leerRol(valor: unknown): Rol {
  if (valor === undefined) return 'EMPLEADO';
  if (valor === 'ADMIN' || valor === 'EMPLEADO') return valor;
  throw invalido('El tipo de cuenta tiene que ser de empleado o de administrador.');
}

const SIN_SUCURSAL = 'Un empleado tiene que tener una sucursal. Elegí en cuál trabaja.';
const ADMIN_CON_SUCURSAL =
  'El administrador no trabaja en una sucursal fija: dejá la sucursal sin elegir.';

/**
 * La sucursal de un EMPLEADO, comprobada contra la base.
 *
 * El schema ya la exige con `chk_empleado_con_sucursal`, pero esa restricción
 * saltaría como un 500. Acá se dice qué falta. Una sucursal cerrada (`activa =
 * false`) cuenta como inexistente: asignarle gente nueva no tiene sentido.
 */
async function leerSucursalDeEmpleado(valor: unknown): Promise<string> {
  if (valor === undefined || valor === null) throw invalido(SIN_SUCURSAL);
  if (!esUuid(valor)) throw invalido('La sucursal elegida no es válida. Volvé a elegirla.');

  const sucursal = await sucursales.buscarPorId(valor);
  if (sucursal === null || !sucursal.activa) {
    throw new ApiError(
      404,
      CODIGOS_ERROR.NO_ENCONTRADO,
      'Esa sucursal no existe o está cerrada. Elegí otra de la lista.',
    );
  }
  return sucursal.id;
}

/**
 * Lo que de una cuenta puede salir por la API. Lista blanca, igual que en el
 * login (`auth.controller.ts`): el model ya no devuelve el hash, y esto es la
 * segunda barrera, para que un cambio en el model no lo publique sin querer.
 */
function paraRespuesta(usuario: Usuario): Usuario {
  return {
    id: usuario.id,
    nombreCompleto: usuario.nombreCompleto,
    username: usuario.username,
    rol: usuario.rol,
    sucursalId: usuario.sucursalId,
    telefono: usuario.telefono,
    activo: usuario.activo,
  };
}

function usernameDuplicado(): ApiError {
  return new ApiError(
    409,
    CODIGOS_ERROR.USERNAME_DUPLICADO,
    'Ese nombre de usuario ya lo usa otra persona. Elegí otro, por ejemplo agregándole el apellido.',
  );
}

/**
 * Si un reintento trae lo mismo que la primera vez.
 *
 * La contraseña no se compara, y no por descuido: guardada solo existe su hash,
 * y traerlo hasta acá rompería la regla de que solo el login lo lee
 * (`buscarPorUsername`). Un reintento de verdad trae la misma de todos modos.
 */
function mismosDatos(guardado: Usuario, pedido: Omit<usuarios.UsuarioRegistrado, 'passwordHash' | 'creadoPor'>): boolean {
  return (
    guardado.nombreCompleto === pedido.nombreCompleto &&
    guardado.username === pedido.username &&
    guardado.rol === pedido.rol &&
    guardado.sucursalId === pedido.sucursalId &&
    guardado.telefono === pedido.telefono
  );
}

/** POST /api/usuarios */
export async function postUsuario(req: Request, res: Response): Promise<void> {
  const cuerpo = comoObjeto(req.body);

  if (!esUuid(cuerpo.id)) {
    throw invalido('Falta el identificador de la cuenta o no es válido. Volvé a intentarlo.');
  }

  const rol = leerRol(cuerpo.rol);
  const datos = {
    id: cuerpo.id,
    nombreCompleto: leerNombre(cuerpo.nombre_completo),
    username: leerUsername(cuerpo.username),
    rol,
    telefono: leerTelefono(cuerpo.telefono),
    sucursalId: null as string | null,
  };
  const contrasena = leerContrasena(cuerpo.password);

  if (rol === 'ADMIN') {
    if (cuerpo.sucursal_id !== undefined && cuerpo.sucursal_id !== null) throw invalido(ADMIN_CON_SUCURSAL);
  } else {
    datos.sucursalId = await leerSucursalDeEmpleado(cuerpo.sucursal_id);
  }

  let resultado: { usuario: Usuario; creado: boolean };
  try {
    resultado = await usuarios.registrar({
      ...datos,
      passwordHash: await bcrypt.hash(contrasena, COSTE_BCRYPT),
      // De la sesión, nunca del cuerpo: el cuerpo podría atribuirle el alta a otro.
      creadoPor: sesionDe(req).id,
    });
  } catch (error) {
    if (error instanceof UsernameOcupadoError) throw usernameDuplicado();
    throw error;
  }

  const { usuario, creado } = resultado;
  if (!creado && !mismosDatos(usuario, datos)) {
    // El mismo id con otros datos no es un reintento: es otra alta que, por lo
    // que sea, reusó un id. Devolver la cuenta vieja como si fuera la nueva
    // haría creer que se creó algo que no se creó.
    throw new ApiError(
      409,
      CODIGOS_ERROR.CONFLICTO,
      'Ya hay otra cuenta guardada con ese identificador. Cerrá el formulario y volvé a cargarla.',
    );
  }

  // 201 la primera vez, 200 en el reintento: los dos son éxito.
  res.status(creado ? 201 : 200).json(paraRespuesta(usuario));
}

/** PATCH /api/usuarios/:id */
export async function patchUsuario(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!esUuid(id)) throw invalido('El identificador de la cuenta no es válido.');

  const actual = await usuarios.buscarPorId(id);
  if (actual === null) {
    throw new ApiError(404, CODIGOS_ERROR.NO_ENCONTRADO, 'Esa cuenta no existe en el sistema.');
  }

  const cuerpo = comoObjeto(req.body);

  // Solo estos cinco. El username y el rol no se cambian: el username es con lo
  // que la persona entra, y el rol decide qué ve. Cualquier otro campo del
  // cuerpo no se lee, así que no puede aplicarse.
  const cambios: CambiosUsuario = {};
  if ('nombre_completo' in cuerpo) cambios.nombreCompleto = leerNombre(cuerpo.nombre_completo);
  if ('telefono' in cuerpo) cambios.telefono = leerTelefono(cuerpo.telefono);

  if ('activo' in cuerpo) {
    if (typeof cuerpo.activo !== 'boolean') throw invalido('Indicá si la cuenta queda activa o no.');
    cambios.activo = cuerpo.activo;
  }

  if ('sucursal_id' in cuerpo) {
    if (actual.rol === 'EMPLEADO') {
      cambios.sucursalId = await leerSucursalDeEmpleado(cuerpo.sucursal_id);
    } else if (cuerpo.sucursal_id !== null) {
      throw invalido(ADMIN_CON_SUCURSAL);
    }
  }

  if (cambios.activo === false && id === sesionDe(req).id) {
    // Si el único admin se da de baja, nadie puede volver a entrar a dar de alta
    // a nadie, y arreglarlo exige tocar la base a mano. Que lo haga otro admin.
    throw new ApiError(
      409,
      CODIGOS_ERROR.BAJA_PROPIA,
      'No podés dar de baja tu propia cuenta. Si hace falta, pedíselo a otro administrador.',
    );
  }

  if ('password' in cuerpo) {
    cambios.passwordHash = await bcrypt.hash(leerContrasena(cuerpo.password), COSTE_BCRYPT);
  }

  const usuario = await usuarios.actualizar(id, cambios, sesionDe(req).id);
  if (usuario === null) {
    throw new ApiError(404, CODIGOS_ERROR.NO_ENCONTRADO, 'Esa cuenta no existe en el sistema.');
  }

  res.json(paraRespuesta(usuario));
}
