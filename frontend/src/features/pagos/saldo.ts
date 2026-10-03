/**
 * El saldo de una orden: cuánto le falta pagar al cliente. **El único lugar** del frontend
 * donde se calcula (CLAUDE.md §6).
 *
 * En Postgres lo resuelve la vista `vw_saldos`, pero las vistas no bajan al dispositivo.
 * Este cálculo es su equivalente offline, con la misma regla de CLAUDE.md §3:
 *
 *     saldo = (precio final, o el precio total si todavía no hay entrega) − suma de pagos
 *
 * Todo en centavos enteros: nada de floats con el dinero. Puede dar negativo si se cobró de
 * más, y ese saldo a favor del cliente también hay que poder verlo.
 */
import { restar, sumar, type Centavos } from '../../lib/money';

export type DatosSaldo = {
  precioTotal: Centavos;
  /** El de la entrega; `null` mientras la ropa no se entregó. */
  precioFinal: Centavos | null;
  /** Los montos de todos los pagos de la orden: adelantos y pago final. */
  pagos: readonly Centavos[];
};

export function calcularSaldo({ precioTotal, precioFinal, pagos }: DatosSaldo): Centavos {
  return restar(precioFinal ?? precioTotal, sumar(...pagos));
}
