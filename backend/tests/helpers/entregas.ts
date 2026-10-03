// Factory de entregas de prueba — creada en SPEC-ALE186-006.
//
// Mismo patrón que `pagos.ts`: una entrega coherente en una línea, que el test
// retoca solo en lo que le importa. Apunta a `ordenDePrueba()` por `IDS.orden`.
//
//   const conBoleta = entregaDePrueba();
//   const sinBoleta = entregaDePrueba({ tipoRetiro: 'SIN_BOLETA', retiradoPorNombre: 'Luis', retiradoPorCarnet: '1234567' });
//
// `cuerpoDeEntrega` es lo que sube la cola de PowerSync al registrar un retiro:
// columnas en snake_case y un id nuevo en cada llamada (CLAUDE.md, sección 6).
// `cuerpoSinBoleta` es el mismo cuerpo con los dos datos que exige un retiro
// sin boleta, para que cada test no tenga que recordarlos.
import { randomUUID } from 'node:crypto';
import type { Entrega } from '../../src/models/entregas.model.js';
import { IDS } from './ordenes.js';

export const ID_ENTREGA = '77777777-7777-7777-7777-777777777777';

export function entregaDePrueba(campos: Partial<Entrega> = {}): Entrega {
  return {
    id: ID_ENTREGA,
    ordenId: IDS.orden,
    sucursalId: IDS.sucursal,
    fechaEntrega: '2026-10-03 17:30:00',
    tipoRetiro: 'CON_BOLETA',
    retiradoPorNombre: null,
    retiradoPorCarnet: null,
    usuarioEntregaId: IDS.usuario,
    precioFinal: '45.50',
    ...campos,
  };
}

export function cuerpoDeEntrega(campos: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: randomUUID(), orden_id: IDS.orden, tipo_retiro: 'CON_BOLETA', ...campos };
}

export function cuerpoSinBoleta(campos: Record<string, unknown> = {}): Record<string, unknown> {
  return cuerpoDeEntrega({
    tipo_retiro: 'SIN_BOLETA',
    retirado_por_nombre: 'Luis Mamani',
    retirado_por_carnet: '1234567 LP',
    ...campos,
  });
}
