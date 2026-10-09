// Controller de pagos — SPEC-ALE186-005. Valida la entrada, llama al model y
// arma la respuesta. No escribe SQL (CLAUDE.md, sección 5).
//
// Solo hay POST, a propósito:
//   - Sin GET: los pagos de la sucursal bajan por el bucket `sucursal` y el saldo
//     se calcula en el dispositivo (sección 6).
//   - Sin PATCH ni DELETE: un cobro ya hecho no se reescribe. Si se cargó mal,
//     se corrige con otro registro, y los dos quedan a la vista.
//
// Como en órdenes, el cuerpo llega con los nombres de columna (`orden_id`...)
// porque es lo que sube la cola de PowerSync, y la respuesta sale en camelCase.
import type { Request, Response } from 'express';
import { revisionDe, sesionDe } from '../middleware/auth.js';
import * as pagos from '../models/pagos.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { esMetodoPago, esTipoPago, type MetodoPago, type TipoPago } from '../utils/dominio.js';
import type { Centavos } from '../utils/money.js';
import type { Sesion } from '../utils/jwt.js';
import { MONTO_MAXIMO, comoObjeto, esInstanteConZona, esUuid, montoEnCentavos } from '../utils/validacion.js';

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

function leerMonto(valor: unknown): Centavos {
  const monto = montoEnCentavos(valor);
  // A diferencia de un precio, un pago nunca es cero (CLAUDE.md, sección 3):
  // un cobro de 0 no es un cobro.
  if (monto === null || monto <= 0 || monto > MONTO_MAXIMO) {
    throw invalido('Escribí cuánto paga el cliente, con números mayores que cero, por ejemplo 20 o 20.50.');
  }
  return monto;
}

function leerTipo(valor: unknown): TipoPago {
  if (!esTipoPago(valor)) throw invalido('Elegí si es un adelanto o el pago final.');
  return valor;
}

function leerMetodo(valor: unknown): MetodoPago {
  if (!esMetodoPago(valor)) {
    throw invalido('Elegí cómo paga el cliente: efectivo, QR, tarjeta o transferencia.');
  }
  return valor;
}

/** Opcional: si no viene, la pone el servidor al guardar. */
function leerFechaPago(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (!esInstanteConZona(valor)) throw invalido('La fecha del cobro no es válida.');
  return valor;
}

/**
 * De qué sucursal puede cobrar órdenes quien hace la petición; `null` = de todas.
 *
 * No es la sucursal del pago —esa sale siempre de la orden—, es un límite: un
 * EMPLEADO solo cobra en la suya. El ADMIN, en cualquiera.
 */
function sucursalPermitida(sesion: Sesion): string | null {
  if (sesion.rol === 'ADMIN') return null;
  if (sesion.sucursalId === null) {
    // Mismo caso imposible que en órdenes: el schema exige sucursal a todo
    // EMPLEADO. Sin ella, `null` lo dejaría cobrar en todas: se corta.
    throw new ApiError(
      403,
      CODIGOS_ERROR.SIN_PERMISO,
      'Tu usuario no tiene una sucursal asignada. Pedile al administrador que lo revise.',
    );
  }
  return sesion.sucursalId;
}

/** POST /api/pagos */
export async function postPago(req: Request, res: Response): Promise<void> {
  const sesion = sesionDe(req);
  const cuerpo = comoObjeto(req.body);

  if (!esUuid(cuerpo.id)) {
    throw invalido('Falta el identificador del cobro o no es válido. Volvé a intentarlo.');
  }
  if (!esUuid(cuerpo.orden_id)) {
    throw invalido('Falta elegir la orden que se está cobrando.');
  }

  const datos: pagos.PagoNuevo = {
    id: cuerpo.id,
    ordenId: cuerpo.orden_id,
    monto: leerMonto(cuerpo.monto),
    tipo: leerTipo(cuerpo.tipo),
    metodo: leerMetodo(cuerpo.metodo),
    fechaPago: leerFechaPago(cuerpo.fecha_pago),
    // De la sesión, NUNCA del cuerpo: queda registrado quién cobró de verdad.
    usuarioId: sesion.id,
    // `sucursal_id` no se lee: el model la copia de la orden.
  };

  const resultado = await pagos.crear(datos, { sucursalId: sucursalPermitida(sesion) }, revisionDe(req));

  switch (resultado.tipo) {
    case 'creado':
      res.status(201).json(resultado.pago);
      return;
    case 'existente':
      // 200 en el reintento: para la cola es tan éxito como el 201.
      res.status(200).json(resultado.pago);
      return;
    case 'orden-no-encontrada':
      // 400 y no 404, igual que un cliente inexistente al registrar una orden:
      // lo que no existe no es el recurso pedido, es un dato del cuerpo. Una
      // orden de otra sucursal responde lo mismo, para no confirmar que existe.
      throw invalido('Esa orden no existe en esta sucursal. Revisá el número de boleta.');
    case 'orden-anulada':
      throw new ApiError(
        409,
        CODIGOS_ERROR.ORDEN_ANULADA,
        `La orden ${resultado.orden.numeroBoleta} está anulada y no se le puede cobrar. ` +
          'Si el cliente ya pagó, avisale al administrador.',
      );
  }
}
