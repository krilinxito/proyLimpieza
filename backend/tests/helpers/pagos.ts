// Factory de pagos de prueba — creada en SPEC-ALE186-005.
//
// Mismo patrón que `ordenes.ts`: un pago coherente en una línea, que el test
// retoca solo en lo que le importa. Apunta a `ordenDePrueba()` por `IDS.orden`.
//
//   const adelanto = pagoDePrueba();
//   const final    = pagoDePrueba({ tipo: 'PAGO_FINAL', monto: '30.00' });
//
// `cuerpoDePago` es lo que sube la cola de PowerSync al registrar un cobro:
// columnas en snake_case y un id nuevo en cada llamada (CLAUDE.md, sección 6).
// La spec de entregas lo va a necesitar para el PAGO_FINAL que acompaña al retiro.
import { randomUUID } from 'node:crypto';
import type { Pago } from '../../src/models/pagos.model.js';
import { IDS } from './ordenes.js';

export const ID_PAGO = '66666666-6666-6666-6666-666666666666';

export function pagoDePrueba(campos: Partial<Pago> = {}): Pago {
  return {
    id: ID_PAGO,
    ordenId: IDS.orden,
    sucursalId: IDS.sucursal,
    monto: '20.00',
    tipo: 'ADELANTO',
    metodo: 'EFECTIVO',
    fechaPago: '2026-10-02 10:15:00',
    usuarioId: IDS.usuario,
    ...campos,
  };
}

export function cuerpoDePago(campos: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    orden_id: IDS.orden,
    monto: '20.00',
    tipo: 'ADELANTO',
    metodo: 'EFECTIVO',
    ...campos,
  };
}
