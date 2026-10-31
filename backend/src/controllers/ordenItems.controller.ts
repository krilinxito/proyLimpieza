// Controller de los renglones de la boleta — SPEC-KRILINXI-068. Valida la entrada, llama al model y arma la
// respuesta. No escribe SQL (CLAUDE.md, sección 5).
//
// Solo hay POST, como en pagos:
//   - Sin GET: los renglones de la sucursal bajan por los buckets `sucursal` y `atencion_admin` (sección 6). El
//     historial del admin los trae dentro de cada boleta (`GET /api/ordenes`).
//   - Sin PATCH ni DELETE: el mostrador no corrige un renglón ya guardado. Eso es del admin (SPEC-KRILINXI-071).
//
// El cuerpo llega con los nombres de columna (`orden_id`, `precio_unitario`…) porque es lo que sube la cola de
// PowerSync, y la respuesta sale en camelCase.
import type { Request, Response } from 'express';
import { revisionDe, sesionDe } from '../middleware/auth.js';
import * as ordenItems from '../models/ordenItems.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { esMomentoItem, type MomentoItem } from '../utils/dominio.js';
import { subtotal, type Centavos } from '../utils/money.js';
import type { Sesion } from '../utils/jwt.js';
import { MONTO_MAXIMO, comoObjeto, esUuid, montoEnCentavos, textoConContenido } from '../utils/validacion.js';

// Lo que admite la columna: VARCHAR(150). Pasarse sería un error de Postgres que acabaría en 500.
const LARGO_MAXIMO_DESCRIPCION = 150;

/**
 * La cantidad más alta de un renglón: 999,99 (en centésimas). Nadie deja mil camisas, y el tope mantiene exacta la
 * cuenta del subtotal en enteros (ver `subtotal` en `utils/money.ts`).
 */
export const CANTIDAD_MAXIMA = 99_999;

/** Lo que entra en SMALLINT, de sobra para los renglones de una boleta. */
const POSICION_MAXIMA = 32_767;

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

function leerMomento(valor: unknown): MomentoItem {
  if (!esMomentoItem(valor)) throw invalido('Falta decir si el renglón es de la boleta o un cargo al entregar.');
  return valor;
}

/** El lugar del renglón en la boleta. Opcional: sin ella, 0. Entera y chica: nadie escribe mil renglones. */
function leerPosicion(valor: unknown): number {
  if (valor === undefined || valor === null) return 0;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > POSICION_MAXIMA) {
    throw invalido('El orden de los renglones no es válido. Vuelve a intentarlo.');
  }
  return valor;
}

function leerDescripcion(valor: unknown): string {
  const descripcion = textoConContenido(valor);
  if (descripcion === null) throw invalido('Escribe qué es cada renglón, por ejemplo "Camisa" o "Edredón".');
  if (descripcion.length > LARGO_MAXIMO_DESCRIPCION) {
    throw invalido('La descripción de un renglón es demasiado larga. Escríbela más corta.');
  }
  return descripcion;
}

/** En centésimas: `"2.5"` son 250. Se lee como un monto porque tiene la misma forma (hasta dos decimales). */
function leerCantidad(valor: unknown): number {
  const cantidad = montoEnCentavos(valor);
  if (cantidad === null || cantidad <= 0 || cantidad > CANTIDAD_MAXIMA) {
    throw invalido('Escribe la cantidad con números mayores que cero, por ejemplo 2 o 2.5.');
  }
  return cantidad;
}

function leerPrecioUnitario(valor: unknown): Centavos {
  const precio = montoEnCentavos(valor);
  // Puede ser cero (una prenda de cortesía), pero nunca negativo (CLAUDE.md, sección 3).
  if (precio === null || precio < 0 || precio > MONTO_MAXIMO) {
    throw invalido('Escribe el precio de cada uno con números, por ejemplo 15 o 15.50.');
  }
  return precio;
}

/**
 * De qué sucursal puede escribir renglones quien hace la petición; `null` = de todas. Misma regla que
 * `sucursalPermitida` en pagos y entregas: un EMPLEADO, solo en la suya.
 */
function sucursalPermitida(sesion: Sesion): string | null {
  if (sesion.rol === 'ADMIN') return null;
  if (sesion.sucursalId === null) {
    throw new ApiError(
      403,
      CODIGOS_ERROR.SIN_PERMISO,
      'Tu usuario no tiene una sucursal asignada. Pídele al administrador que lo revise.',
    );
  }
  return sesion.sucursalId;
}

/** POST /api/orden-items */
export async function postOrdenItem(req: Request, res: Response): Promise<void> {
  const sesion = sesionDe(req);
  const cuerpo = comoObjeto(req.body);

  if (!esUuid(cuerpo.id)) {
    throw invalido('Falta el identificador del renglón o no es válido. Vuelve a intentarlo.');
  }
  if (!esUuid(cuerpo.orden_id)) {
    throw invalido('Falta elegir la boleta a la que pertenece el renglón.');
  }

  const cantidad = leerCantidad(cuerpo.cantidad);
  const precioUnitario = leerPrecioUnitario(cuerpo.precio_unitario);
  if (subtotal(cantidad, precioUnitario) > MONTO_MAXIMO) {
    throw invalido('El subtotal de ese renglón es demasiado alto. Revisa la cantidad y el precio.');
  }

  const datos: ordenItems.ItemNuevo = {
    id: cuerpo.id,
    ordenId: cuerpo.orden_id,
    momento: leerMomento(cuerpo.momento),
    posicion: leerPosicion(cuerpo.posicion),
    descripcion: leerDescripcion(cuerpo.descripcion),
    cantidad,
    precioUnitario,
    // De la sesión, NUNCA del cuerpo: queda registrado quién lo cargó de verdad.
    usuarioId: sesion.id,
    // `sucursal_id` no se lee: el model la copia de la orden.
  };

  const resultado = await ordenItems.crear(datos, { sucursalId: sucursalPermitida(sesion) }, revisionDe(req));

  switch (resultado.tipo) {
    case 'creado':
      res.status(201).json(resultado.item);
      return;
    case 'existente':
      // 200 en el reintento: para la cola es tan éxito como el 201.
      res.status(200).json(resultado.item);
      return;
    case 'orden-no-encontrada':
      // 400 y no 404, como en pagos: lo que no existe es un dato del cuerpo. Una orden de otra sucursal responde lo
      // mismo, para no confirmar que existe.
      throw invalido('Esa boleta no existe en esta sucursal. Revisa el número de boleta.');
    case 'orden-cerrada':
      throw new ApiError(
        409,
        CODIGOS_ERROR.ORDEN_CERRADA,
        `La boleta ${resultado.orden.numeroBoleta} ya fue entregada o anulada, y no se le pueden agregar renglones. ` +
          'Si hay que corregirla, avísale al administrador.',
      );
    case 'total-excedido':
      throw new ApiError(
        409,
        CODIGOS_ERROR.TOTAL_EXCEDIDO,
        `Con ese renglón, la boleta ${resultado.orden.numeroBoleta} sumaría más que su total. ` +
          `Le quedan Bs ${resultado.disponible} por repartir: revisa la cantidad y el precio.`,
      );
  }
}
