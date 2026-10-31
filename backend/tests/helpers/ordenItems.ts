// Factory de renglones de la boleta de prueba — creada en SPEC-KRILINXI-068.
//
// Mismo patrón que `pagos.ts`: un renglón coherente en una línea, que el test retoca solo en lo que le importa.
// Apunta a `ordenDePrueba()` por `IDS.orden`.
//
//   const camisa = renglonDePrueba();
//   const recargo = renglonDePrueba({ momento: 'ENTREGA', descripcion: 'Recargo por almacenamiento' });
//
// `cuerpoDeRenglon` es lo que sube la cola de PowerSync al guardar un renglón: columnas en snake_case y un id nuevo
// en cada llamada (CLAUDE.md, sección 6).
import { randomUUID } from 'node:crypto';
import type { OrdenItem } from '../../src/models/ordenItems.model.js';
import { IDS } from './ordenes.js';

export const ID_RENGLON = '88888888-8888-8888-8888-888888888888';

export function renglonDePrueba(campos: Partial<OrdenItem> = {}): OrdenItem {
  return {
    id: ID_RENGLON,
    ordenId: IDS.orden,
    sucursalId: IDS.sucursal,
    momento: 'INGRESO',
    posicion: 0,
    descripcion: 'Camisa',
    cantidad: '2.00',
    precioUnitario: '15.00',
    ...campos,
  };
}

export function cuerpoDeRenglon(campos: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    orden_id: IDS.orden,
    momento: 'INGRESO',
    posicion: 0,
    descripcion: 'Camisa',
    cantidad: '2',
    precio_unitario: '15.00',
    ...campos,
  };
}
