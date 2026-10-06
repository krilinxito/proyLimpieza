// Controller de sucursales — SPEC-ALE186-011. Valida la entrada, llama al model
// y arma la respuesta. No escribe SQL (CLAUDE.md, sección 5).
//
// Solo ADMIN, y eso lo decide la ruta con `requireRol`, no este archivo.
//
// No hay GET: `sucursales` ya baja a todos los dispositivos por el bucket
// `global` (sección 7). Tampoco hay DELETE: una sucursal se cierra con
// `activa: false`, porque sus órdenes, pagos y entregas siguen apuntando a ella.
import type { Request, Response } from 'express';
import { sesionDe } from '../middleware/auth.js';
import * as sucursales from '../models/sucursales.model.js';
import { NombreOcupadoError, type CambiosSucursal, type Sucursal } from '../models/sucursales.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { comoObjeto, esUuid, textoHasta } from '../utils/validacion.js';

// Los largos de las columnas en el schema (`VARCHAR(n)`).
const MAX_NOMBRE = 100;
const MAX_DIRECCION = 200;
const MAX_TELEFONO = 30;

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

function leerNombre(valor: unknown): string {
  const nombre = textoHasta(valor, MAX_NOMBRE);
  if (nombre === null) {
    throw invalido(`Escribí el nombre de la sucursal (hasta ${MAX_NOMBRE} letras).`);
  }
  return nombre;
}

/** Opcional: ausente, `null` o vacío se guarda como NULL. */
function leerOpcional(valor: unknown, max: number, mensaje: string): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const texto = textoHasta(valor, max);
  if (texto === null) throw invalido(mensaje);
  return texto;
}

function leerDireccion(valor: unknown): string | null {
  return leerOpcional(valor, MAX_DIRECCION, `Revisá la dirección: puede tener hasta ${MAX_DIRECCION} caracteres.`);
}

function leerTelefono(valor: unknown): string | null {
  return leerOpcional(valor, MAX_TELEFONO, `Revisá el teléfono: puede tener hasta ${MAX_TELEFONO} caracteres.`);
}

function nombreDuplicado(nombre: string): ApiError {
  return new ApiError(
    409,
    CODIGOS_ERROR.NOMBRE_SUCURSAL_DUPLICADO,
    `Ya hay una sucursal que se llama "${nombre}". Elegí otro nombre, por ejemplo con la zona o la calle.`,
  );
}

function noEncontrada(): ApiError {
  return new ApiError(404, CODIGOS_ERROR.NO_ENCONTRADO, 'Esa sucursal no existe en el sistema.');
}

/** Si un reintento trae lo mismo que la primera vez. */
function mismosDatos(guardada: Sucursal, pedida: sucursales.SucursalNueva): boolean {
  return (
    guardada.nombre === pedida.nombre &&
    guardada.direccion === pedida.direccion &&
    guardada.telefono === pedida.telefono
  );
}

/** POST /api/sucursales */
export async function postSucursal(req: Request, res: Response): Promise<void> {
  const cuerpo = comoObjeto(req.body);

  if (!esUuid(cuerpo.id)) {
    throw invalido('Falta el identificador de la sucursal o no es válido. Volvé a intentarlo.');
  }

  const datos: sucursales.SucursalNueva = {
    id: cuerpo.id,
    nombre: leerNombre(cuerpo.nombre),
    direccion: leerDireccion(cuerpo.direccion),
    telefono: leerTelefono(cuerpo.telefono),
  };

  let resultado: { sucursal: Sucursal; creada: boolean };
  try {
    // Quién la crea, para la auditoría: de la sesión, nunca del cuerpo.
    resultado = await sucursales.registrar(datos, sesionDe(req).id);
  } catch (error) {
    if (error instanceof NombreOcupadoError) throw nombreDuplicado(error.nombre);
    throw error;
  }

  const { sucursal, creada } = resultado;
  if (!creada && !mismosDatos(sucursal, datos)) {
    // El mismo id con otros datos no es un reintento: es otra alta que reusó un
    // id. Devolver la vieja como si fuera la nueva haría creer que se creó.
    throw new ApiError(
      409,
      CODIGOS_ERROR.CONFLICTO,
      'Ya hay otra sucursal guardada con ese identificador. Cerrá el formulario y volvé a cargarla.',
    );
  }

  // 201 la primera vez, 200 en el reintento: los dos son éxito.
  res.status(creada ? 201 : 200).json(sucursal);
}

/** PATCH /api/sucursales/:id */
export async function patchSucursal(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!esUuid(id)) throw invalido('El identificador de la sucursal no es válido.');

  const cuerpo = comoObjeto(req.body);

  // Solo estos cuatro. Cualquier otro campo del cuerpo —el id, por ejemplo— se
  // ignora: no se lee, así que no puede aplicarse.
  const cambios: CambiosSucursal = {};
  if ('nombre' in cuerpo) cambios.nombre = leerNombre(cuerpo.nombre);
  if ('direccion' in cuerpo) cambios.direccion = leerDireccion(cuerpo.direccion);
  if ('telefono' in cuerpo) cambios.telefono = leerTelefono(cuerpo.telefono);
  if ('activa' in cuerpo) {
    if (typeof cuerpo.activa !== 'boolean') throw invalido('Indicá si la sucursal queda abierta o cerrada.');
    cambios.activa = cuerpo.activa;
  }

  const resultado = await sucursales.actualizar(id, cambios, sesionDe(req).id);

  switch (resultado.tipo) {
    case 'actualizada':
      res.json(resultado.sucursal);
      return;
    case 'no-encontrada':
      throw noEncontrada();
    case 'nombre-ocupado':
      throw nombreDuplicado(cambios.nombre ?? '');
    case 'con-ropa-abierta': {
      const { cantidad } = resultado;
      const cuantas = cantidad === 1 ? 'Queda 1 orden' : `Quedan ${cantidad} órdenes`;
      throw new ApiError(
        409,
        CODIGOS_ERROR.SUCURSAL_CON_ROPA,
        `${cuantas} con ropa en esta sucursal. Los clientes vuelven a retirarla acá, ` +
          'así que no se puede cerrar hasta que se entreguen o se anulen.',
      );
    }
  }
}
