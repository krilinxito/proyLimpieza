/**
 * Factories de filas para sembrar la base local de prueba — SPEC-KRILINXI-008
 *
 * Cada una arma una fila válida, con los nombres de columna de la base, y cada test cambia
 * solo lo que le importa. Pensadas para `sembrar` de `baseLocalDePrueba` (las filas quedan
 * como "ya sincronizadas", fuera de la cola):
 *
 *     const { sembrar } = await baseLocalDePrueba();
 *     const rosa = clienteDePrueba({ nombre: 'Rosa Quispe' });
 *     const orden = ordenDePrueba({ cliente_id: rosa.id, numero_boleta: '001234', estado: 'LISTO' });
 *     await sembrar('clientes', [rosa]);
 *     await sembrar('ordenes', [orden]);
 *     await sembrar('pagos', [pagoDePrueba({ orden_id: orden.id, monto: '20.00' })]);
 *
 * La sucursal por defecto es la del EMPLEADO de `sesionDePrueba()`: lo que se siembra es
 * "de su sucursal" salvo que el test diga otra.
 */
import { randomUUID } from 'node:crypto';
import { sesionDePrueba } from './sesion';

export const SUCURSAL_DE_PRUEBA = sesionDePrueba().usuario.sucursalId ?? '';

type Fila = Record<string, unknown>;

export function clienteDePrueba(cambios: Fila = {}) {
  return { id: randomUUID(), nombre: 'Rosa Quispe', telefono: '70123456', carnet: null, ...cambios };
}

/** Una orden RECIBIDO de Bs 50,00, que entró hace un rato. */
export function ordenDePrueba(cambios: Fila = {}) {
  return {
    id: randomUUID(),
    numero_boleta: '001234',
    cliente_id: randomUUID(),
    sucursal_id: SUCURSAL_DE_PRUEBA,
    descripcion: '2 pantalones',
    fecha_entrada: '2026-10-01T10:00:00.000Z',
    fecha_estimada_salida: null,
    precio_total: '50.00',
    estado: 'RECIBIDO',
    ...cambios,
  };
}

export function pagoDePrueba(cambios: Fila = {}) {
  return {
    id: randomUUID(),
    orden_id: randomUUID(),
    sucursal_id: SUCURSAL_DE_PRUEBA,
    monto: '20.00',
    tipo: 'ADELANTO',
    metodo: 'EFECTIVO',
    fecha_pago: '2026-10-01T10:05:00.000Z',
    ...cambios,
  };
}

export function entregaDePrueba(cambios: Fila = {}) {
  return {
    id: randomUUID(),
    orden_id: randomUUID(),
    sucursal_id: SUCURSAL_DE_PRUEBA,
    tipo_retiro: 'CON_BOLETA',
    precio_final: '50.00',
    fecha_entrega: '2026-10-02T18:00:00.000Z',
    ...cambios,
  };
}
