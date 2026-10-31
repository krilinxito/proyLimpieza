/**
 * Las reglas de estado de una orden en el dispositivo — SPEC-KRILINXI-008.
 *
 * Tres cosas, y las tres en un único lugar:
 *
 *  1. **El estado que se muestra** (`estadoEfectivo`). El paso a ENTREGADO lo hace el
 *     servidor al recibir la entrega (SPEC-ALE186-006), así que en la tablet una orden recién
 *     entregada sigue diciendo RECIBIDO hasta que sincroniza. Lo que manda es si existe su
 *     entrega. Sin esto, la ropa se vería como entregable dos veces.
 *
 *  2. **Qué cambios se permiten** (`ORIGENES`). Es la misma tabla que el backend
 *     (`backend/src/utils/dominio.ts`), y `estado.test.ts` lee ese archivo y la compara: si
 *     una cambia sin la otra, el test falla. Validar aquí es cortesía; la garantía la da el
 *     servidor (CLAUDE.md §6).
 *
 *  3. **Leer el estado guardado en la tablet** (`estadoDeLaBase`). Desde SPEC-KRILINXI-067 la
 *     boleta no tiene pasos intermedios (se quitaron EN_PROCESO y LISTO), pero una tablet que no
 *     sincronizó todavía puede tener boletas guardadas con esos valores: se leen como RECIBIDO.
 */
import type { TonoInsignia } from '../../components/Insignia';
import { esEstadoOrden, type EstadoOrden } from '../../lib/dominio';

/** Los estados de los que ya no se sale. */
export const ESTADOS_CERRADOS: readonly EstadoOrden[] = ['ENTREGADO', 'REEMBOLSADO', 'ANULADO'];

/**
 * Desde qué estados se puede llegar a cada uno. Copia de la tabla del backend: cada destino
 * se incluye a sí mismo para que un reintento no sea un error, y a ENTREGADO y REEMBOLSADO no se
 * llega por aquí (se llega registrando la entrega).
 */
export const ORIGENES: Record<EstadoOrden, readonly EstadoOrden[]> = {
  RECIBIDO: ['RECIBIDO'],
  ANULADO: ['RECIBIDO', 'ANULADO'],
  ENTREGADO: [],
  REEMBOLSADO: [],
};

/** Los dos estados que existieron hasta SPEC-KRILINXI-067: lo que una tablet sin sincronizar aún puede tener. */
const ESTADOS_QUE_SE_QUITARON = ['EN_PROCESO', 'LISTO'];

/**
 * El estado tal como está guardado en la base local, o `null` si no es ninguno que se conozca.
 * Los dos que se quitaron se leen como RECIBIDO: esa ropa sigue en el local, sin entregar.
 */
export function estadoDeLaBase(valor: unknown): EstadoOrden | null {
  if (typeof valor === 'string' && ESTADOS_QUE_SE_QUITARON.includes(valor)) return 'RECIBIDO';
  return esEstadoOrden(valor) ? valor : null;
}

/** El estado que ve el empleado: ENTREGADO si ya tiene entrega, aunque no haya sincronizado. */
export function estadoEfectivo(estado: EstadoOrden, tieneEntrega: boolean): EstadoOrden {
  return tieneEntrega ? 'ENTREGADO' : estado;
}

/**
 * El tono con que se pinta cada estado — SPEC-KRILINXI-025. Es del negocio (qué estado merece
 * atención), por eso vive acá y no en `components/`: la `Insignia` solo recibe el tono.
 *
 * Lo que importa en el mostrador es cuál no se toca más y por qué: lo anulado y lo reembolsado
 * (la ropa salió sin cobrarse del todo) van en rojo (peligro); el resto es neutro, para no gritar
 * todo a la vez. El color solo ayuda a encontrarla: la insignia siempre dice el estado en palabras.
 */
export const TONO_ESTADO: Record<EstadoOrden, TonoInsignia> = {
  RECIBIDO: 'neutro',
  ENTREGADO: 'neutro',
  REEMBOLSADO: 'peligro',
  ANULADO: 'peligro',
};

export function estaCerrada(estado: EstadoOrden): boolean {
  return ESTADOS_CERRADOS.includes(estado);
}

/** Si se puede pasar de `actual` a `destino`. Pedir el estado en el que ya está no es un cambio. */
export function puedePasarA(actual: EstadoOrden, destino: EstadoOrden): boolean {
  return actual !== destino && ORIGENES[destino].includes(actual);
}
