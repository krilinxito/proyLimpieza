/**
 * Entregar la ropa en la base local — SPEC-KRILINXI-009.
 *
 * Mismo patrón que `features/ordenes/api/ordenesLocal.ts`: la base llega como argumento,
 * todo es SQL sobre SQLite y nada habla con la API. Se escribe la entrega y, si se cobra
 * algo, el pago final **antes** que la entrega, y las dos cosas en una sola transacción: la cola
 * los sube en ese orden, `POST /api/pagos` y después `POST /api/entregas` (SPEC-ALE186-005 y 006).
 * Desde SPEC-KRILINXI-056 el servidor rechaza una entrega cuya boleta no quedó pagada por completo
 * (409 `SALDO_PENDIENTE`), y el pago tiene que haber llegado antes para que cuente.
 *
 * **Nunca toca `ordenes.estado`.** El paso a ENTREGADO lo hace el servidor en la misma
 * sentencia que inserta la entrega, y el PATCH a ENTREGADO está prohibido (responde 409).
 * En la tablet la orden se ve entregada igual, por `estadoEfectivo` (SPEC-KRILINXI-008).
 *
 * Va en dos pasos: `prepararEntrega` valida sin escribir (y pide cobrar todo lo que falta, SPEC-KRILINXI-056),
 * y `registrarEntrega` vuelve a validar y escribe.
 *
 * Desde SPEC-KRILINXI-068 el precio final no se escribe: es el precio de la boleta más sus cargos al entregar, que son
 * renglones (`orden_items` con momento ENTREGA). Los cargos van primero en la transacción, después el pago y al final la
 * entrega: el servidor calcula el precio final con los cargos que ya tiene, y rechaza la entrega si no da lo mismo.
 */
import type { BaseLocal, Sentencia } from '../../../lib/powersync';
import { aDecimal, formatearBs, parsearMonto, sumar, type Centavos } from '../../../lib/money';
import { horaOficial } from '../../../lib/reloj';
import { sentenciaRenglon } from '../../ordenes/api/renglonesLocal';
import { obtenerOrden } from '../../ordenes/api/ropaLocal';
import { claveCampo, sumaDeCargos, totalDe, validarRenglon, type RenglonValido } from '../../ordenes/renglones';
import type { QuienRegistra } from '../../ordenes/types';
import { sentenciaPago } from '../../pagos/api/pagosLocal';
import { calcularSaldo } from '../../pagos/saldo';
import type { DatosEntrega, EntregaLista, ErroresEntrega, ResultadoEntrega } from '../types';

const LARGO_MAXIMO_NOMBRE = 150; // VARCHAR(150)
const LARGO_MAXIMO_CARNET = 30; // VARCHAR(30)
const MONTO_MAXIMO: Centavos = 9_999_999_999; // NUMERIC(10,2)

export const MENSAJES_ENTREGA = {
  noEncontrada: 'No se encontró esa boleta en esta sucursal.',
  anulada: 'Esta ropa fue anulada: no se puede entregar.',
  yaEntregada: 'Esta ropa ya fue entregada.',
  sinBoletaElegida: 'Elige si el cliente trae la boleta o no.',
  sinNombre: 'Si no trae la boleta, escribe el nombre de quien retira la ropa.',
  sinCarnet: 'Si no trae la boleta, escribe el carnet de quien retira la ropa.',
  nombreLargo: 'El nombre de quien retira es demasiado largo.',
  carnetLargo: 'El carnet de quien retira es demasiado largo. Revísalo y vuelve a escribirlo.',
  precioFinal: 'Con esos cargos, el precio final es demasiado alto. Revisa las cantidades y los precios.',
  pago: 'Escribe cuánto paga el cliente, con números mayores que cero, por ejemplo 20 o 20,50.',
  pagoMayor: 'El cobro no puede ser mayor que lo que falta pagar.',
  /** Falta cobrar: la ropa no sale hasta que la boleta esté pagada por completo (SPEC-KRILINXI-056). */
  faltaCobrar: (falta: Centavos) => `Falta cobrar ${formatearBs(falta)}. Escribe cuánto paga ahora para dejar la boleta pagada.`,
  sinMetodo: 'Elige cómo paga: efectivo, QR o tarjeta.',
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

  // Los cargos al entregar (SPEC-KRILINXI-068): cada uno con las reglas de un renglón, y el precio final, el de la boleta
  // más los que ya tenga y los nuevos. Si alguno está mal no hay precio final que calcular.
  const cargos: RenglonValido[] = [];
  for (const cargo of datos.cargos) {
    const { errores: suyos, valido } = validarRenglon(cargo);
    if (suyos.descripcion) errores[claveCampo(cargo.clave, 'descripcion')] = suyos.descripcion;
    if (suyos.cantidad) errores[claveCampo(cargo.clave, 'cantidad')] = suyos.cantidad;
    if (suyos.precioUnitario) errores[claveCampo(cargo.clave, 'precioUnitario')] = suyos.precioUnitario;
    if (valido) cargos.push(valido);
  }
  let precioFinal: Centavos | null = null;
  if (cargos.length === datos.cargos.length) {
    precioFinal = orden.precioTotal + sumaDeCargos(orden.renglones) + totalDe(cargos).total;
    if (precioFinal > MONTO_MAXIMO) {
      errores.cargos = MENSAJES_ENTREGA.precioFinal;
      precioFinal = null;
    }
  }

  const pagado = sumar(...orden.pagos.map((p) => p.monto));
  const hayPago = datos.pagoFinal.trim() !== '';
  const pagoFinal = hayPago ? leerMonto(datos.pagoFinal) : 0;
  if (hayPago) {
    if (pagoFinal === null || pagoFinal <= 0) errores.pagoFinal = MENSAJES_ENTREGA.pago;
    else if (precioFinal !== null && pagoFinal > precioFinal - pagado) errores.pagoFinal = MENSAJES_ENTREGA.pagoMayor;
    if (!datos.metodoPago) errores.metodoPago = MENSAJES_ENTREGA.sinMetodo;
  }

  // La ropa solo sale con la boleta pagada por completo (SPEC-KRILINXI-056). Si ya hay otro error en el cobro, ese va primero.
  const montos = orden.pagos.map((p) => p.monto);
  if (precioFinal !== null && pagoFinal !== null && !errores.pagoFinal) {
    const falta = calcularSaldo({ precioTotal: orden.precioTotal, precioFinal, pagos: [...montos, pagoFinal] });
    if (falta > 0) errores.pagoFinal = MENSAJES_ENTREGA.faltaCobrar(falta);
  }

  if (Object.keys(errores).length > 0 || datos.traeBoleta === null || precioFinal === null || pagoFinal === null) {
    return { tipo: 'invalida', errores };
  }

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
      cargos,
      pagoFinal,
      metodoPago: hayPago ? datos.metodoPago : null,
    },
  };
}

/**
 * Vuelve a validar (pudo cambiar algo entre la confirmación y el toque) y escribe, en una sola
 * transacción: primero los cargos (SPEC-KRILINXI-068), después el pago final y al final la entrega. Ese
 * orden es el que sube la cola, y el servidor mira los cargos y lo cobrado al recibir la entrega
 * (SPEC-KRILINXI-056). Si algo no valida, no escribe nada.
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
  // La hora del servidor aunque el reloj de la tablet esté mal, en el formato ISO 8601 con zona
  // que exige el backend (SPEC-KRILINXI-012).
  const ahora = horaOficial();

  // Los cargos van después de los que la boleta ya tuviera: su posición sigue la cuenta.
  const orden = await obtenerOrden(base, quien.sucursalId, ordenId);
  const yaHay = orden?.renglones.filter((r) => r.momento === 'ENTREGA').length ?? 0;
  const sentencias: Sentencia[] = entrega.cargos.map((renglon, i) =>
    sentenciaRenglon({ renglon, ordenId, sucursalId: quien.sucursalId, momento: 'ENTREGA', posicion: yaHay + i }),
  );
  // Después el pago: la cola sube en este orden, y el servidor cuenta lo ya cobrado al recibir la entrega.
  if (entrega.pagoFinal > 0 && entrega.metodoPago) {
    sentencias.push(
      sentenciaPago(crypto.randomUUID(), {
        ordenId,
        sucursalId: quien.sucursalId,
        usuarioId: quien.usuarioId,
        monto: entrega.pagoFinal,
        tipo: 'PAGO_FINAL',
        metodo: entrega.metodoPago,
        fechaPago: ahora,
      }),
    );
  }
  sentencias.push({
    sql: `INSERT INTO entregas (id, orden_id, sucursal_id, fecha_entrega, tipo_retiro,
                               retirado_por_nombre, retirado_por_carnet, usuario_entrega_id, precio_final)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    parametros: [
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
  });
  await base.ejecutarJuntas(sentencias);

  return resultado;
}
