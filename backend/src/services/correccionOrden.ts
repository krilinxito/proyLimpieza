// La corrección de una boleta por el admin — SPEC-KRILINXI-071.
//
// El admin arregla lo que un empleado registró mal: el número, la descripción, las fechas, las prendas (y con ellas el
// total) y la sucursal, en el estado que esté la boleta. No cabe en un model: escribe en tres tablas (`ordenes`,
// `orden_items` y, si cambia de sucursal, la copia de `sucursal_id` en `pagos`, `entregas` y `orden_items`) y tiene que
// decidir entre medio. Lógica de negocio que no es de una sola tabla: lo que le toca a `services/` (CLAUDE.md §5). Los
// models siguen siendo los únicos que escriben SQL; este archivo solo los llama en orden.
//
// Todo pasa en UNA transacción (`enTransaccion`), y en este orden:
//
//   1. Bloquear la orden (`FOR UPDATE`). Desde acá nadie más la cambia, la entrega ni le agrega renglones.
//   2. Decidir. Cada regla que puede decir que no se mira ANTES de escribir nada, así que un rechazo no deja nada a
//      medio hacer y no hace falta deshacer: se devuelve el motivo y la transacción se confirma vacía.
//   3. Escribir: la orden (con su auditoría), después sus registros en la sucursal nueva, y por último los renglones.
//      Un error que solo Postgres puede ver (el número de boleta repetido en la sucursal adonde se mueve) llega como
//      excepción en este paso, y `enTransaccion` deshace todo lo anterior.
import { enTransaccion } from '../db/transaccion.js';
import * as ordenItems from '../models/ordenItems.model.js';
import type { RenglonCorregido } from '../models/ordenItems.model.js';
import * as ordenes from '../models/ordenes.model.js';
import type { CambiosCorreccion, Orden } from '../models/ordenes.model.js';
import type { Revision } from '../models/auditoria.model.js';
import { formatear, subtotal, sumar, type Centavos } from '../utils/money.js';

export type { RenglonCorregido };

export interface Correccion extends CambiosCorreccion {
  /**
   * TODAS las prendas de la boleta (los renglones de INGRESO) como tienen que quedar, o `undefined` si no se tocan.
   * Va entera, y no un renglón por pedido, porque el total tiene que ser su suma: con pedidos sueltos, entre uno y otro
   * la boleta quedaría con un total que no cuadra con sus prendas.
   */
  renglones?: readonly RenglonCorregido[];
}

export type ResultadoCorreccion =
  | { tipo: 'corregida'; orden: Orden }
  | { tipo: 'no-encontrada' }
  | { tipo: 'sucursal-cerrada' }
  | { tipo: 'sucursal-no-existe' }
  | { tipo: 'fecha-futura' }
  /** El total quedaría por debajo de lo que ya se cobró. `pagado`, como `"30.00"`. */
  | { tipo: 'total-menor-que-cobrado'; orden: Orden; pagado: string }
  /** Se cambió el total sin las prendas, y no cuadra con lo que suman. `suma`, como `"30.00"`. */
  | { tipo: 'total-distinto-de-renglones'; orden: Orden; suma: string }
  /** Un id de la lista es de un cargo al entregar, o de un renglón de otra boleta. */
  | { tipo: 'renglon-ajeno'; orden: Orden; renglonId: string; esCargo: boolean };

/** Lo que suman unas prendas, en centavos. La misma cuenta que Postgres (`SUBTOTAL_SQL`) y la tablet. */
export function sumaDeRenglones(renglones: readonly Pick<RenglonCorregido, 'cantidad' | 'precioUnitario'>[]): Centavos {
  return sumar(...renglones.map((r) => subtotal(r.cantidad, r.precioUnitario)));
}

export async function corregirOrden(
  id: string,
  correccion: Correccion,
  autorId: string,
  revision: Revision | null = null,
): Promise<ResultadoCorreccion> {
  return enTransaccion(async (conexion): Promise<ResultadoCorreccion> => {
    // 1. Bloquear.
    const actual = await ordenes.leerParaCorregir(conexion, id);
    if (actual === null) return { tipo: 'no-encontrada' };
    const { orden } = actual;

    // 2. Decidir, sin escribir nada todavía.
    const { renglones, ...cambios } = correccion;

    // La sucursal: solo se mira si de verdad cambia. Moverla a la que ya tiene no es moverla.
    if (cambios.sucursalId === orden.sucursalId) delete cambios.sucursalId;
    if (cambios.sucursalId !== undefined) {
      const destino = await ordenes.estadoDeLaSucursal(conexion, cambios.sucursalId);
      if (destino === 'no-existe') return { tipo: 'sucursal-no-existe' };
      if (destino === 'cerrada') return { tipo: 'sucursal-cerrada' };
    }

    if (cambios.fechaEntrada !== undefined && (await ordenes.esFechaFutura(conexion, cambios.fechaEntrada))) {
      return { tipo: 'fecha-futura' };
    }

    // Los renglones de la boleta. Cada id tiene que ser de una prenda de ESTA boleta, o nuevo de verdad.
    const existentes = await ordenItems.buscarVarios(conexion, renglones?.map((r) => r.id) ?? []);
    for (const existente of existentes) {
      // Los cargos al entregar no se corrigen acá: van con el pago y la entrega (spec admin-corrige-pagos-entregas).
      if (existente.ordenId !== id || existente.momento !== 'INGRESO') {
        return { tipo: 'renglon-ajeno', orden, renglonId: existente.id, esCargo: existente.ordenId === id };
      }
    }

    // El total. Con prendas, es su suma; sin prendas, el que se escriba.
    if (renglones !== undefined && renglones.length > 0) {
      cambios.precioTotal = sumaDeRenglones(renglones);
    } else if (renglones === undefined && cambios.precioTotal !== undefined) {
      // Se cambia el total a mano, sin tocar las prendas: solo vale si la boleta no tiene ninguna (una de antes de los
      // renglones, SPEC-KRILINXI-068). Si tiene, el total es lo que suman, y se corrige cambiándolas a ellas.
      const prendas = await ordenItems.deLaOrden(conexion, id, 'INGRESO');
      const suma = sumaDeRenglones(prendas);
      if (prendas.length > 0 && suma !== cambios.precioTotal) {
        return { tipo: 'total-distinto-de-renglones', orden, suma: formatear(suma) };
      }
    }

    // Lo cobrado. Mientras la ropa no salió, el saldo es el total menos lo pagado, y bajar el total por debajo de lo
    // cobrado lo dejaría negativo. Ya entregada, el saldo se mide con el precio final de la entrega, que esto no toca
    // (lo cobrado ahí se corrige con la entrega): la regla no aplica.
    if (!actual.tieneEntrega && cambios.precioTotal !== undefined && cambios.precioTotal < actual.pagado) {
      return { tipo: 'total-menor-que-cobrado', orden, pagado: formatear(actual.pagado) };
    }

    // 3. Escribir.
    const corregida = await ordenes.aplicarCorreccion(conexion, id, cambios, autorId, revision);
    if (cambios.sucursalId !== undefined) await ordenes.moverRegistrosDeLaOrden(conexion, id);
    if (renglones !== undefined) {
      await ordenItems.reemplazarIngreso(conexion, { ordenId: id, renglones, autorId, revision });
    }
    return { tipo: 'corregida', orden: corregida };
  });
}
