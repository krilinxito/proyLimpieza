// Controller de entregas — SPEC-ALE186-006. Valida la entrada, llama al model y
// arma la respuesta. No escribe SQL (CLAUDE.md, sección 5).
//
// Solo hay POST, igual que en pagos:
//   - Sin GET: las entregas de la sucursal bajan por el bucket `sucursal`.
//   - Sin PATCH ni DELETE: un retiro ya hecho no se reescribe.
//
// El cobro final NO va acá: se registra aparte, por POST /api/pagos.
import type { Request, Response } from 'express';
import { revisionDe, sesionDe } from '../middleware/auth.js';
import * as entregas from '../models/entregas.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { esTipoRetiro, type TipoRetiro } from '../utils/dominio.js';
import type { Centavos } from '../utils/money.js';
import type { Sesion } from '../utils/jwt.js';
import {
  MONTO_MAXIMO,
  comoObjeto,
  esInstanteConZona,
  esUuid,
  montoEnCentavos,
  textoConContenido,
} from '../utils/validacion.js';

// Lo que admiten las columnas del schema. Pasarse sería un error de Postgres
// que acabaría en 500, así que se corta antes.
const LARGO_MAXIMO_NOMBRE = 150; // VARCHAR(150)
const LARGO_MAXIMO_CARNET = 30; // VARCHAR(30)

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

function leerTipoRetiro(valor: unknown): TipoRetiro {
  if (!esTipoRetiro(valor)) throw invalido('Elegí si el cliente trae la boleta o no.');
  return valor;
}

/** Opcional en sí mismo: ausente o en blanco es `null`. El largo se controla siempre. */
function leerTextoOpcional(valor: unknown, largoMaximo: number, mensajeLargo: string): string | null {
  const texto = textoConContenido(valor);
  if (texto !== null && texto.length > largoMaximo) throw invalido(mensajeLargo);
  return texto;
}

/** Opcional: si no viene, se cobra el precio con que se recibió la orden. */
function leerPrecioFinal(valor: unknown): Centavos | null {
  if (valor === undefined || valor === null) return null;
  const precio = montoEnCentavos(valor);
  // Puede ser cero (se perdonó el cobro), pero nunca negativo.
  if (precio === null || precio < 0 || precio > MONTO_MAXIMO) {
    throw invalido('Escribí el precio final con números, por ejemplo 45 o 45.50.');
  }
  return precio;
}

/** Opcional: si no viene, la pone el servidor al guardar. */
function leerFechaEntrega(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (!esInstanteConZona(valor)) throw invalido('La fecha de entrega de la ropa no es válida.');
  return valor;
}

/**
 * De qué sucursal puede entregar órdenes quien hace la petición; `null` = de todas.
 *
 * La ropa se retira en la misma sucursal donde se dejó, así que un EMPLEADO
 * solo entrega órdenes de la suya. El ADMIN, de cualquiera. (Misma regla que
 * `sucursalPermitida` en el controller de pagos.)
 */
function sucursalPermitida(sesion: Sesion): string | null {
  if (sesion.rol === 'ADMIN') return null;
  if (sesion.sucursalId === null) {
    throw new ApiError(
      403,
      CODIGOS_ERROR.SIN_PERMISO,
      'Tu usuario no tiene una sucursal asignada. Pedile al administrador que lo revise.',
    );
  }
  return sesion.sucursalId;
}

/** POST /api/entregas */
export async function postEntrega(req: Request, res: Response): Promise<void> {
  const sesion = sesionDe(req);
  const cuerpo = comoObjeto(req.body);

  if (!esUuid(cuerpo.id)) {
    throw invalido('Falta el identificador de la entrega o no es válido. Volvé a intentarlo.');
  }
  if (!esUuid(cuerpo.orden_id)) {
    throw invalido('Falta elegir la orden que se está entregando.');
  }

  const tipoRetiro = leerTipoRetiro(cuerpo.tipo_retiro);
  const retiradoPorNombre = leerTextoOpcional(
    cuerpo.retirado_por_nombre,
    LARGO_MAXIMO_NOMBRE,
    'El nombre de quien retira es demasiado largo.',
  );
  const retiradoPorCarnet = leerTextoOpcional(
    cuerpo.retirado_por_carnet,
    LARGO_MAXIMO_CARNET,
    'El carnet de quien retira es demasiado largo. Revisalo y volvé a escribirlo.',
  );

  // Regla del negocio (CLAUDE.md, sección 3): sin boleta, quien retira tiene que
  // dejar nombre Y carnet. El schema también lo exige (chk_datos_sin_boleta),
  // pero si se dejara caer hasta ahí sería un 500 sin mensaje.
  if (tipoRetiro === 'SIN_BOLETA' && (retiradoPorNombre === null || retiradoPorCarnet === null)) {
    throw invalido('Si el cliente no trae la boleta, escribí el nombre y el carnet de quien retira la ropa.');
  }

  const datos: entregas.EntregaNueva = {
    id: cuerpo.id,
    ordenId: cuerpo.orden_id,
    tipoRetiro,
    retiradoPorNombre,
    retiradoPorCarnet,
    precioFinal: leerPrecioFinal(cuerpo.precio_final),
    fechaEntrega: leerFechaEntrega(cuerpo.fecha_entrega),
    // De la sesión, NUNCA del cuerpo: queda registrado quién entregó de verdad.
    usuarioEntregaId: sesion.id,
    // `sucursal_id` no se lee: el model la copia de la orden.
  };

  const resultado = await entregas.crear(datos, { sucursalId: sucursalPermitida(sesion) }, revisionDe(req));

  switch (resultado.tipo) {
    case 'creada':
      res.status(201).json(resultado.entrega);
      return;
    case 'existente':
      // 200 en el reintento: para la cola es tan éxito como el 201.
      res.status(200).json(resultado.entrega);
      return;
    case 'orden-no-encontrada':
      // 400 y no 404, como en pagos: lo que no existe es un dato del cuerpo. Una
      // orden de otra sucursal responde lo mismo, para no confirmar que existe.
      throw invalido('Esa orden no existe en esta sucursal. Revisá el número de boleta.');
    case 'orden-anulada':
      throw new ApiError(
        409,
        CODIGOS_ERROR.ORDEN_ANULADA,
        `La orden ${resultado.orden.numeroBoleta} está anulada y no se puede entregar. ` +
          'Si el cliente se lleva la ropa igual, avisale al administrador.',
      );
    case 'orden-ya-entregada':
      throw new ApiError(
        409,
        CODIGOS_ERROR.ORDEN_YA_ENTREGADA,
        `La ropa de la orden ${resultado.orden.numeroBoleta} ya fue entregada. ` +
          'Revisá el número de boleta.',
      );
  }
}
