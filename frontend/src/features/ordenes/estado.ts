/**
 * Las reglas de estado de una orden en el dispositivo — SPEC-KRILINXI-008.
 *
 * Dos cosas, y las dos en un único lugar:
 *
 *  1. **El estado que se muestra** (`estadoEfectivo`). El paso a ENTREGADO lo hace el
 *     servidor al recibir la entrega (SPEC-ALE186-006), así que en la tablet una orden recién
 *     entregada sigue diciendo LISTO hasta que sincroniza. Lo que manda es si existe su
 *     entrega. Sin esto, la ropa se vería como entregable dos veces.
 *
 *  2. **Qué avances se permiten** (`ORIGENES`). Es la misma tabla que el backend
 *     (`backend/src/utils/dominio.ts`), y `estado.test.ts` lee ese archivo y la compara: si
 *     una cambia sin la otra, el test falla. Validar aquí es cortesía; la garantía la da el
 *     servidor (CLAUDE.md §6).
 */
import type { EstadoOrden } from '../../lib/dominio';

/** Los estados de los que ya no se sale. */
export const ESTADOS_CERRADOS: readonly EstadoOrden[] = ['ENTREGADO', 'ANULADO'];

/**
 * Desde qué estados se puede llegar a cada uno. Copia de la tabla del backend: cada destino
 * se incluye a sí mismo para que un reintento no sea un error, y a ENTREGADO no se llega
 * por aquí (se llega registrando la entrega).
 */
export const ORIGENES: Record<EstadoOrden, readonly EstadoOrden[]> = {
  RECIBIDO: ['RECIBIDO'],
  EN_PROCESO: ['RECIBIDO', 'EN_PROCESO'],
  LISTO: ['RECIBIDO', 'EN_PROCESO', 'LISTO'],
  ANULADO: ['RECIBIDO', 'EN_PROCESO', 'LISTO', 'ANULADO'],
  ENTREGADO: [],
};

/** El estado que ve el empleado: ENTREGADO si ya tiene entrega, aunque no haya sincronizado. */
export function estadoEfectivo(estado: EstadoOrden, tieneEntrega: boolean): EstadoOrden {
  return tieneEntrega ? 'ENTREGADO' : estado;
}

export function estaCerrada(estado: EstadoOrden): boolean {
  return ESTADOS_CERRADOS.includes(estado);
}

/** Los avances del mostrador, en el orden en que pasa la ropa. ANULADO va aparte: pide confirmación. */
export const AVANCES = [
  { destino: 'EN_PROCESO', texto: 'Empezar a lavar' },
  { destino: 'LISTO', texto: 'Marcar como lista' },
] as const satisfies readonly { destino: EstadoOrden; texto: string }[];

export type Avance = (typeof AVANCES)[number];

/** Si se puede pasar de `actual` a `destino`. Pedir el estado en el que ya está no es avanzar. */
export function puedePasarA(actual: EstadoOrden, destino: EstadoOrden): boolean {
  return actual !== destino && ORIGENES[destino].includes(actual);
}

/** Los avances que se le ofrecen al empleado desde el estado actual. */
export function avancesDesde(actual: EstadoOrden): Avance[] {
  return AVANCES.filter(({ destino }) => puedePasarA(actual, destino));
}
