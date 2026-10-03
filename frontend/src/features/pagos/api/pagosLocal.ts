/**
 * Los pagos en la base local — SPEC-KRILINXI-006.
 *
 * Igual que `features/clientes/api/clientesLocal.ts`: recibe la base como argumento, escribe
 * SQL en SQLite y nunca habla con la API. Lo que se escribe queda en la cola y sube como
 * `POST /api/pagos` (SPEC-ALE186-005).
 *
 * No valida: quien la llama (el registro de la orden, más adelante el cobro) ya comprobó el
 * monto y el método, porque es quien sabe contra qué precio compararlo.
 */
import type { BaseLocal } from '../../../lib/powersync';
import { aDecimal, type Centavos } from '../../../lib/money';
import type { MetodoPago, TipoPago } from '../../../lib/dominio';

export type PagoNuevo = {
  ordenId: string;
  /** La de la orden: un pago va siempre a la sucursal de su orden (CLAUDE.md §7). */
  sucursalId: string;
  usuarioId: string;
  monto: Centavos;
  tipo: TipoPago;
  metodo: MetodoPago;
  /** ISO 8601 con zona, como pide el backend. */
  fechaPago: string;
};

/** Guarda el pago con un id del dispositivo y lo devuelve. */
export async function insertarPago(base: BaseLocal, pago: PagoNuevo): Promise<string> {
  const id = crypto.randomUUID();
  await base.ejecutar(
    `INSERT INTO pagos (id, orden_id, sucursal_id, usuario_id, monto, tipo, metodo, fecha_pago)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, pago.ordenId, pago.sucursalId, pago.usuarioId, aDecimal(pago.monto), pago.tipo, pago.metodo, pago.fechaPago],
  );
  return id;
}
