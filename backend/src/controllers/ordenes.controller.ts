// Controller de órdenes. Valida la entrada, llama al model y arma la respuesta.
// No escribe SQL (CLAUDE.md, sección 5).
//
// No hay GET a propósito: las órdenes de la sucursal bajan al dispositivo por el
// bucket `sucursal` y se leen de SQLite local (sección 6). Tampoco hay DELETE:
// una orden no se borra, se anula.
//
// El cuerpo llega con los nombres de columna (`numero_boleta`, `cliente_id`...)
// porque es lo que sube la cola de PowerSync: cada cambio local viaja con las
// columnas de la tabla. La respuesta sale en camelCase, como la de clientes.
import type { Request, Response } from 'express';
import { sesionDe } from '../middleware/auth.js';
import * as ordenes from '../models/ordenes.model.js';
import {
  BoletaOcupadaError,
  ClienteInexistenteError,
  type CambiosOrden,
  type Orden,
} from '../models/ordenes.model.js';
import * as sucursales from '../models/sucursales.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { esEstadoOrden, estadosDeOrigen, type EstadoOrden } from '../utils/dominio.js';
import type { Centavos } from '../utils/money.js';
import type { Sesion } from '../utils/jwt.js';
import {
  comoObjeto,
  esFechaCalendario,
  esInstanteConZona,
  esUuid,
  montoEnCentavos,
  textoConContenido,
} from '../utils/validacion.js';

// Lo que admiten las columnas del schema. Pasarse no es un 400 para Postgres:
// es un error de tipo que acabaría en 500, así que se corta antes.
const LARGO_MAXIMO_BOLETA = 30; // VARCHAR(30)
const PRECIO_MAXIMO: Centavos = 9_999_999_999; // NUMERIC(10,2) = 99.999.999,99

// Cómo se dice cada estado en el mostrador (sección 9: el idioma del negocio).
const ESTADO_EN_PALABRAS: Record<EstadoOrden, string> = {
  RECIBIDO: 'recibida',
  EN_PROCESO: 'en proceso',
  LISTO: 'lista para recoger',
  ENTREGADO: 'entregada',
  ANULADO: 'anulada',
};

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

function leerBoleta(valor: unknown): string {
  const boleta = textoConContenido(valor);
  if (boleta === null) throw invalido('Escribí el número de la boleta.');
  if (boleta.length > LARGO_MAXIMO_BOLETA) {
    throw invalido('Ese número de boleta es demasiado largo. Revisá el papel y volvé a escribirlo.');
  }
  return boleta;
}

function leerDescripcion(valor: unknown): string {
  const descripcion = textoConContenido(valor);
  if (descripcion === null) throw invalido('Escribí qué ropa deja el cliente.');
  return descripcion;
}

function leerPrecio(valor: unknown): Centavos {
  const precio = montoEnCentavos(valor);
  // El precio puede ser cero (un trabajo de cortesía), pero nunca negativo.
  if (precio === null || precio < 0 || precio > PRECIO_MAXIMO) {
    throw invalido('Escribí el precio con números, por ejemplo 25 o 25.50.');
  }
  return precio;
}

/** Opcional: ausente, `null` o vacío es "sin fecha estimada". */
function leerFechaEstimada(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (!esFechaCalendario(valor)) throw invalido('La fecha de entrega estimada no es válida.');
  return valor;
}

/** Opcional: si no viene, la pone el servidor al guardar. */
function leerFechaEntrada(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (!esInstanteConZona(valor)) throw invalido('La fecha de ingreso de la ropa no es válida.');
  return valor;
}

function boletaDuplicada(): ApiError {
  return new ApiError(
    409,
    CODIGOS_ERROR.BOLETA_DUPLICADA,
    'Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo.',
  );
}

/**
 * La sucursal en la que queda registrada la orden.
 *
 * Un EMPLEADO registra siempre en la suya, la de su sesión: lo que diga el
 * cuerpo se ignora, o cualquier dispositivo podría escribir en otra sucursal.
 * Un ADMIN no tiene sucursal (sección 3) pero a veces atiende el mostrador, así
 * que en su caso la indica él, y se comprueba que exista y esté abierta.
 */
async function sucursalDeRegistro(sesion: Sesion, cuerpo: Record<string, unknown>): Promise<string> {
  if (sesion.rol === 'EMPLEADO') {
    if (sesion.sucursalId === null) {
      // No debería pasar: el schema exige sucursal a todo EMPLEADO. Si pasa, no
      // hay dónde registrar la orden, y adivinarlo sería peor.
      throw new ApiError(
        403,
        CODIGOS_ERROR.SIN_PERMISO,
        'Tu usuario no tiene una sucursal asignada. Pedile al administrador que lo revise.',
      );
    }
    return sesion.sucursalId;
  }

  const id = cuerpo.sucursal_id;
  const sucursal = esUuid(id) ? await sucursales.buscarPorId(id) : null;
  if (sucursal === null || !sucursal.activa) {
    throw invalido('Elegí en qué sucursal estás atendiendo.');
  }
  return sucursal.id;
}

/** POST /api/ordenes */
export async function postOrden(req: Request, res: Response): Promise<void> {
  const sesion = sesionDe(req);
  const cuerpo = comoObjeto(req.body);

  if (!esUuid(cuerpo.id)) {
    throw invalido('Falta el identificador de la orden o no es válido. Volvé a intentarlo.');
  }
  if (!esUuid(cuerpo.cliente_id)) {
    throw invalido('Falta elegir el cliente que deja la ropa.');
  }

  const datos: ordenes.OrdenNueva = {
    id: cuerpo.id,
    numeroBoleta: leerBoleta(cuerpo.numero_boleta),
    clienteId: cuerpo.cliente_id,
    descripcion: leerDescripcion(cuerpo.descripcion),
    precioTotal: leerPrecio(cuerpo.precio_total),
    fechaEstimadaSalida: leerFechaEstimada(cuerpo.fecha_estimada_salida),
    fechaEntrada: leerFechaEntrada(cuerpo.fecha_entrada),
    // De la sesión, NUNCA del cuerpo: queda registrado quién recibió de verdad.
    usuarioRecepcionId: sesion.id,
    sucursalId: await sucursalDeRegistro(sesion, cuerpo),
    // `estado` no se lee: toda orden nace RECIBIDO, lo diga o no el cuerpo.
  };

  try {
    const { orden, creada } = await ordenes.crear(datos);
    // 201 la primera vez, 200 en el reintento: los dos son éxito para la cola.
    res.status(creada ? 201 : 200).json(orden);
  } catch (error) {
    if (error instanceof BoletaOcupadaError) throw boletaDuplicada();
    if (error instanceof ClienteInexistenteError) {
      throw invalido('Ese cliente no está registrado. Buscalo por su teléfono o dalo de alta.');
    }
    throw error;
  }
}

/** Por qué no se pudo cambiar el estado, en palabras del mostrador. */
function transicionInvalida(actual: Orden, pedido: EstadoOrden | undefined): ApiError {
  const boleta = actual.numeroBoleta;
  let mensaje: string;

  if (pedido === 'ENTREGADO') {
    mensaje = 'Para dar la ropa por entregada, registrá la entrega desde "Entregar ropa".';
  } else if (actual.estado === 'ENTREGADO' || actual.estado === 'ANULADO') {
    mensaje = `La orden ${boleta} ya está ${ESTADO_EN_PALABRAS[actual.estado]} y no se puede cambiar.`;
  } else {
    // Solo queda un caso: `pedido` es un estado anterior al actual.
    mensaje =
      `La orden ${boleta} ya está ${ESTADO_EN_PALABRAS[actual.estado]} ` +
      `y no puede volver a "${ESTADO_EN_PALABRAS[pedido ?? actual.estado]}".`;
  }

  return new ApiError(409, CODIGOS_ERROR.TRANSICION_INVALIDA, mensaje);
}

/** PATCH /api/ordenes/:id */
export async function patchOrden(req: Request, res: Response): Promise<void> {
  const sesion = sesionDe(req);
  const { id } = req.params;

  if (!esUuid(id)) throw invalido('El identificador de la orden no es válido.');

  const cuerpo = comoObjeto(req.body);

  // Solo estos cinco. Cualquier otro campo —cliente, sucursal, quién recibió,
  // fecha de entrada— se ignora: no se lee, así que no puede aplicarse.
  const cambios: CambiosOrden = {};
  if ('numero_boleta' in cuerpo) cambios.numeroBoleta = leerBoleta(cuerpo.numero_boleta);
  if ('descripcion' in cuerpo) cambios.descripcion = leerDescripcion(cuerpo.descripcion);
  if ('precio_total' in cuerpo) cambios.precioTotal = leerPrecio(cuerpo.precio_total);
  if ('fecha_estimada_salida' in cuerpo) {
    cambios.fechaEstimadaSalida = leerFechaEstimada(cuerpo.fecha_estimada_salida);
  }
  if ('estado' in cuerpo) {
    if (!esEstadoOrden(cuerpo.estado)) throw invalido('Ese estado de la orden no existe.');
    cambios.estado = cuerpo.estado;
  }

  const tocaOtrosCampos = Object.keys(cambios).some((campo) => campo !== 'estado');

  let resultado: ordenes.ResultadoActualizar;
  try {
    resultado = await ordenes.actualizar(id, cambios, {
      estadosDeOrigen: estadosDeOrigen(cambios.estado, tocaOtrosCampos),
      // El ADMIN puede corregir órdenes de cualquier sucursal; un EMPLEADO solo
      // las de la suya. Una ajena le responde 404, no 403: para él no existe, y
      // un 403 le confirmaría que ese id es una orden de otra sucursal.
      sucursalId: sesion.rol === 'ADMIN' ? null : sesion.sucursalId,
    });
  } catch (error) {
    if (error instanceof BoletaOcupadaError) throw boletaDuplicada();
    throw error;
  }

  switch (resultado.tipo) {
    case 'actualizada':
      res.json(resultado.orden);
      return;
    case 'no-encontrada':
      throw new ApiError(404, CODIGOS_ERROR.NO_ENCONTRADO, 'Esa orden no existe en esta sucursal.');
    case 'estado-no-admitido':
      throw transicionInvalida(resultado.orden, cambios.estado);
  }
}
