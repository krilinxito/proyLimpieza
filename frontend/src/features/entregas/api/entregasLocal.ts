/**
 * Entregar la ropa en la base local — SPEC-KRILINXI-009.
 *
 * Mismo patrón que `features/ordenes/api/ordenesLocal.ts`: la base llega como argumento,
 * todo es SQL sobre SQLite y nada habla con la API. Se escribe la entrega y, si se cobra
 * algo, después el pago final. La cola los sube en ese orden: `POST /api/entregas` y
 * `POST /api/pagos` (SPEC-ALE186-006 y 005).
 *
 * **Nunca toca `ordenes.estado`.** El paso a ENTREGADO lo hace el servidor en la misma
 * sentencia que inserta la entrega, y el PATCH a ENTREGADO está prohibido (responde 409).
 * En la tablet la orden se ve entregada igual, por `estadoEfectivo` (SPEC-KRILINXI-008).
 *
 * Va en dos pasos para que la confirmación pueda decir cuánto queda debiendo:
 * `prepararEntrega` valida sin escribir, y `registrarEntrega` vuelve a validar y escribe.
 */
import type { BaseLocal } from '../../../lib/powersync';
import { aDecimal, parsearMonto, sumar, type Centavos } from '../../../lib/money';
import { obtenerOrden } from '../../ordenes/api/ropaLocal';
import type { QuienRegistra } from '../../ordenes/types';
import { insertarPago } from '../../pagos/api/pagosLocal';
import { calcularSaldo } from '../../pagos/saldo';
import type { DatosEntrega, EntregaLista, ErroresEntrega, ResultadoEntrega } from '../types';

const LARGO_MAXIMO_NOMBRE = 150; // VARCHAR(150)
const LARGO_MAXIMO_CARNET = 30; // VARCHAR(30)
const MONTO_MAXIMO: Centavos = 9_999_999_999; // NUMERIC(10,2)

export const MENSAJES_ENTREGA = {
  noEncontrada: 'No se encontró esa boleta en esta sucursal.',
  anulada: 'Esta ropa fue anulada: no se puede entregar.',
  yaEntregada: 'Esta ropa ya fue entregada.',
  sinBoletaElegida: 'Elegí si el cliente trae la boleta o no.',
  sinNombre: 'Si no trae la boleta, escribí el nombre de quien retira la ropa.',
  sinCarnet: 'Si no trae la boleta, escribí el carnet de quien retira la ropa.',
  nombreLargo: 'El nombre de quien retira es demasiado largo.',
  carnetLargo: 'El carnet de quien retira es demasiado largo. Revisalo y volvé a escribirlo.',
  precioFinal: 'Escribí el precio final con números, por ejemplo 45 o 45,50.',
  pago: 'Escribí cuánto paga el cliente, con números mayores que cero, por ejemplo 20 o 20,50.',
  pagoMayor: 'El cobro no puede ser mayor que lo que falta pagar.',
  sinMetodo: 'Elegí cómo paga: efectivo, QR, tarjeta o transferencia.',
} as const;

function leerMonto(texto: string): Centavos | null {
  try {
    return parsearMonto(texto);
  } catch {
    return null;
  }
}

/** Valida todo, sin escribir nada. */
export async function prepararEntrega(
  base: BaseLocal,
  sucursalId: string,
  ordenId: string,
  datos: DatosEntrega,
): Promise<ResultadoEntrega> {
  const orden = await obtenerOrden(base, sucursalId, ordenId);
  if (!orden) return { tipo: 'no-se-puede', mensaje: MENSAJES_ENTREGA.noEncontrada };
  // El estado efectivo: una entregada sin sincronizar también cuenta como entregada.
  if (orden.estado === 'ANULADO') return { tipo: 'no-se-puede', mensaje: MENSAJES_ENTREGA.anulada };
  if (orden.estado === 'ENTREGADO') return { tipo: 'no-se-puede', mensaje: MENSAJES_ENTREGA.yaEntregada };

  const errores: ErroresEntrega = {};
  const nombre = datos.retiradoPorNombre.trim();
  const carnet = datos.retiradoPorCarnet.trim();

  if (datos.traeBoleta === null) errores.traeBoleta = MENSAJES_ENTREGA.sinBoletaElegida;
  if (datos.traeBoleta === false) {
    // Regla del negocio (CLAUDE.md §3): sin boleta, nombre Y carnet de quien retira.
    if (nombre === '') errores.retiradoPorNombre = MENSAJES_ENTREGA.sinNombre;
    else if (nombre.length > LARGO_MAXIMO_NOMBRE) errores.retiradoPorNombre = MENSAJES_ENTREGA.nombreLargo;
    if (carnet === '') errores.retiradoPorCarnet = MENSAJES_ENTREGA.sinCarnet;
    else if (carnet.length > LARGO_MAXIMO_CARNET) errores.retiradoPorCarnet = MENSAJES_ENTREGA.carnetLargo;
  }

  const precioFinal = leerMonto(datos.precioFinal);
  if (precioFinal === null || precioFinal > MONTO_MAXIMO) errores.precioFinal = MENSAJES_ENTREGA.precioFinal;

  const pagado = sumar(...orden.pagos.map((p) => p.monto));
  const hayPago = datos.pagoFinal.trim() !== '';
  const pagoFinal = hayPago ? leerMonto(datos.pagoFinal) : 0;
  if (hayPago) {
    if (pagoFinal === null || pagoFinal <= 0) errores.pagoFinal = MENSAJES_ENTREGA.pago;
    else if (precioFinal !== null && pagoFinal > precioFinal - pagado) errores.pagoFinal = MENSAJES_ENTREGA.pagoMayor;
    if (!datos.metodoPago) errores.metodoPago = MENSAJES_ENTREGA.sinMetodo;
  }

  if (Object.keys(errores).length > 0 || datos.traeBoleta === null || precioFinal === null || pagoFinal === null) {
    return { tipo: 'invalida', errores };
  }

  const montos = orden.pagos.map((p) => p.monto);
  return {
    tipo: 'lista',
    entrega: {
      ordenId,
      numeroBoleta: orden.numeroBoleta,
      tipoRetiro: datos.traeBoleta ? 'CON_BOLETA' : 'SIN_BOLETA',
      // Con boleta no se pide a nadie: se guarda vacío.
      retiradoPorNombre: datos.traeBoleta ? null : nombre,
      retiradoPorCarnet: datos.traeBoleta ? null : carnet,
      precioFinal,
      pagoFinal,
      metodoPago: hayPago ? datos.metodoPago : null,
      saldoDespues: calcularSaldo({ precioTotal: orden.precioTotal, precioFinal, pagos: [...montos, pagoFinal] }),
    },
  };
}

/**
 * Vuelve a validar (pudo cambiar algo entre la confirmación y el toque) y escribe: primero
 * la entrega, después el pago final. Si algo no valida, no escribe nada.
 */
export async function registrarEntrega(
  base: BaseLocal,
  quien: QuienRegistra,
  ordenId: string,
  datos: DatosEntrega,
): Promise<ResultadoEntrega> {
  const resultado = await prepararEntrega(base, quien.sucursalId, ordenId, datos);
  if (resultado.tipo !== 'lista') return resultado;
  const entrega: EntregaLista = resultado.entrega;
  // ISO 8601 con zona: el formato que exige el backend.
  const ahora = new Date().toISOString();

  await base.ejecutar(
    `INSERT INTO entregas (id, orden_id, sucursal_id, fecha_entrega, tipo_retiro,
                           retirado_por_nombre, retirado_por_carnet, usuario_entrega_id, precio_final)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      ordenId,
      // La sucursal de la orden, que es la del empleado: `obtenerOrden` solo encuentra
      // órdenes de su sucursal. La ropa se retira donde se dejó (CLAUDE.md §3).
      quien.sucursalId,
      ahora,
      entrega.tipoRetiro,
      entrega.retiradoPorNombre,
      entrega.retiradoPorCarnet,
      quien.usuarioId,
      aDecimal(entrega.precioFinal),
    ],
  );

  if (entrega.pagoFinal > 0 && entrega.metodoPago) {
    await insertarPago(base, {
      ordenId,
      sucursalId: quien.sucursalId,
      usuarioId: quien.usuarioId,
      monto: entrega.pagoFinal,
      tipo: 'PAGO_FINAL',
      metodo: entrega.metodoPago,
      fechaPago: ahora,
    });
  }

  return resultado;
}
