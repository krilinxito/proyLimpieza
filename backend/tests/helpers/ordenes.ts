// Factory de órdenes de prueba — creada en SPEC-ALE186-004.
//
// Mismo patrón que `clientes.ts`: una orden coherente en una línea, que el test
// retoca solo en lo que le importa.
//
//   const orden = ordenDePrueba();
//   const lista = ordenDePrueba({ estado: 'LISTO' });
//
// `cuerpoDeOrden` es lo que sube la cola de PowerSync al registrar una orden:
// columnas en snake_case y un id nuevo en cada llamada, porque lo genera el
// dispositivo (CLAUDE.md, sección 6). Pagos y entregas van a necesitar una
// orden existente a la que apuntar: `ordenDePrueba()` es esa orden.
import { randomUUID } from 'node:crypto';
import type { Orden } from '../../src/models/ordenes.model.js';

/** Los mismos ids que usan `usuarios.ts` y `clientes.ts`, para que cuadren. */
export const IDS = {
  usuario: '11111111-1111-1111-1111-111111111111',
  sucursal: '22222222-2222-2222-2222-222222222222',
  otraSucursal: '33333333-3333-3333-3333-333333333333',
  cliente: '44444444-4444-4444-4444-444444444444',
  orden: '55555555-5555-5555-5555-555555555555',
} as const;

export function ordenDePrueba(campos: Partial<Orden> = {}): Orden {
  return {
    id: IDS.orden,
    numeroBoleta: '001234',
    clienteId: IDS.cliente,
    sucursalId: IDS.sucursal,
    usuarioRecepcionId: IDS.usuario,
    descripcion: '2 camisas, 1 terno',
    fechaEntrada: '2026-09-30 10:15:00',
    fechaEstimadaSalida: '2026-10-03',
    precioTotal: '45.50',
    estado: 'RECIBIDO',
    ...campos,
  };
}

export function cuerpoDeOrden(campos: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    numero_boleta: '001234',
    cliente_id: IDS.cliente,
    descripcion: '2 camisas, 1 terno',
    precio_total: '45.50',
    ...campos,
  };
}
