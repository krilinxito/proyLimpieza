// Controller de clientes. Valida la entrada, llama al model y arma la respuesta.
// No escribe SQL (CLAUDE.md, sección 5).
//
// No hay GET a propósito: los clientes se sincronizan enteros al dispositivo
// (bucket `global`) y el mostrador los busca en su SQLite local. Un GET acá
// haría que la búsqueda dependiera de internet (sección 6).
import type { Request, Response } from 'express';
import { sesionDe } from '../middleware/auth.js';
import * as clientes from '../models/clientes.model.js';
import { TelefonoOcupadoError, type CambiosCliente } from '../models/clientes.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import {
  comoObjeto,
  esUuid,
  normalizarTelefono,
  textoConContenido,
} from '../utils/validacion.js';

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

function leerNombre(valor: unknown): string {
  const nombre = textoConContenido(valor);
  if (nombre === null) throw invalido('Escribí el nombre del cliente.');
  return nombre;
}

function leerTelefono(valor: unknown): string {
  const texto = textoConContenido(valor);
  const telefono = texto === null ? '' : normalizarTelefono(texto);
  if (telefono === '') throw invalido('Escribí el número de teléfono del cliente.');
  return telefono;
}

/** El carnet es opcional: vacío o ausente se guarda como NULL. */
function leerCarnet(valor: unknown): string | null {
  return textoConContenido(valor);
}

/**
 * Traduce el teléfono ocupado a un 409 que dice qué hacer.
 *
 * Nombrar al otro cliente no filtra nada: la tabla `clientes` entera ya está en
 * el dispositivo de cualquier empleado. En cambio, le ahorra a la persona del
 * mostrador la duda de si se equivocó ella o si ese cliente ya estaba.
 */
async function telefonoDuplicado(telefono: string): Promise<ApiError> {
  const dueno = await clientes.buscarPorTelefono(telefono);
  const aNombreDe = dueno === null ? 'otro cliente' : dueno.nombre;

  return new ApiError(
    409,
    CODIGOS_ERROR.TELEFONO_DUPLICADO,
    `Ese teléfono ya está registrado a nombre de ${aNombreDe}. ` +
      'Buscalo por su teléfono en vez de darlo de alta otra vez.',
  );
}

/** POST /api/clientes */
export async function postCliente(req: Request, res: Response): Promise<void> {
  const cuerpo = comoObjeto(req.body);

  if (!esUuid(cuerpo.id)) {
    throw invalido('Falta el identificador del cliente o no es válido. Volvé a intentarlo.');
  }

  const datos: clientes.ClienteNuevo = {
    id: cuerpo.id,
    nombre: leerNombre(cuerpo.nombre),
    telefono: leerTelefono(cuerpo.telefono),
    carnet: leerCarnet(cuerpo.carnet),
    // De la sesión, NUNCA del cuerpo: si viniera del cuerpo, cualquiera podría
    // decir que registró al cliente en otra sucursal. Un ADMIN no tiene
    // sucursal, así que ahí queda en NULL.
    sucursalRegistroId: sesionDe(req).sucursalId,
  };

  try {
    const { cliente, creado } = await clientes.crear(datos, sesionDe(req).id);
    // 201 la primera vez, 200 en el reintento: los dos son éxito para la cola
    // de subida, y la diferencia queda a la vista de quien mire los logs.
    res.status(creado ? 201 : 200).json(cliente);
  } catch (error) {
    if (error instanceof TelefonoOcupadoError) throw await telefonoDuplicado(error.telefono);
    throw error;
  }
}

/** PATCH /api/clientes/:id */
export async function patchCliente(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  // Sin esto, un id mal formado llegaría a Postgres y volvería como un error
  // de tipo UUID: un 500 para algo que es un 400.
  if (!esUuid(id)) throw invalido('El identificador del cliente no es válido.');

  const cuerpo = comoObjeto(req.body);

  // Solo estos tres. Cualquier otro campo del cuerpo —el id, la fecha de
  // registro, la sucursal— se ignora: no se lee, así que no puede aplicarse.
  const cambios: CambiosCliente = {};
  if ('nombre' in cuerpo) cambios.nombre = leerNombre(cuerpo.nombre);
  if ('telefono' in cuerpo) cambios.telefono = leerTelefono(cuerpo.telefono);
  if ('carnet' in cuerpo) cambios.carnet = leerCarnet(cuerpo.carnet);

  let cliente: clientes.Cliente | null;
  try {
    cliente = await clientes.actualizar(id, cambios, sesionDe(req).id);
  } catch (error) {
    if (error instanceof TelefonoOcupadoError) throw await telefonoDuplicado(error.telefono);
    throw error;
  }

  if (cliente === null) {
    throw new ApiError(404, CODIGOS_ERROR.NO_ENCONTRADO, 'Ese cliente no existe en el sistema.');
  }

  res.json(cliente);
}
