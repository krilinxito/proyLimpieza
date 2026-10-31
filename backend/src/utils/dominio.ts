// Los valores válidos del negocio, del lado del servidor — creado en SPEC-ALE186-004.
//
// En Postgres son ENUM (`context/lavanderia_schema.sql` y, desde SPEC-ALE186-019, sus migraciones). Al dispositivo llegan
// como texto, porque SQLite no tiene ENUM, y de vuelta suben como texto. El
// frontend los valida en `lib/dominio` para que el empleado se entere al momento;
// eso es cortesía. La garantía es esta: el backend vuelve a validar al recibir
// la escritura (CLAUDE.md, sección 6).
//
// Sin esto, un valor mal escrito llegaría a Postgres, que lo rechazaría con un
// error de tipo, y el manejador central lo convertiría en un 500: un fallo del
// servidor para lo que es una petición mal formada.
//
// Las listas son las mismas que las del frontend, y `tests/unit/dominio.test.ts`
// las compara con el schema: si uno cambia sin el otro, falla.

export const ESTADOS_ORDEN = ['RECIBIDO', 'ENTREGADO', 'REEMBOLSADO', 'ANULADO'] as const;
export const TIPOS_RETIRO = ['CON_BOLETA', 'SIN_BOLETA'] as const;
export const TIPOS_PAGO = ['ADELANTO', 'PAGO_FINAL'] as const;
export const METODOS_PAGO = ['EFECTIVO', 'QR', 'TARJETA'] as const;
/** Cuándo se agregó un renglón de la boleta: al registrarla o, como cargo, al entregarla — SPEC-KRILINXI-068. */
export const MOMENTOS_ITEM = ['INGRESO', 'ENTREGA'] as const;

export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];
export type TipoRetiro = (typeof TIPOS_RETIRO)[number];
export type TipoPago = (typeof TIPOS_PAGO)[number];
export type MetodoPago = (typeof METODOS_PAGO)[number];
export type MomentoItem = (typeof MOMENTOS_ITEM)[number];

/**
 * Qué se anota en `auditoria` — SPEC-ALE186-010.
 *
 * No viene del dispositivo, así que no hay validador: la elige el model que
 * escribe. Está acá igual para que el test la compare con el ENUM del schema.
 * ELIMINAR existe en el ENUM pero hoy no lo usa nadie: no se borra nada (las
 * bajas son `activo: false` y las anulaciones, un cambio de estado).
 */
export const ACCIONES_AUDITORIA = ['CREAR', 'EDITAR', 'ELIMINAR', 'LOGIN', 'ENTREGAR', 'COBRAR'] as const;
export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

/** Un "type guard": si da `true`, TypeScript sabe que el valor es de la lista. */
function crearValidador<const T extends readonly string[]>(valores: T) {
  return (valor: unknown): valor is T[number] => valores.some((v) => v === valor);
}

export const esEstadoOrden = crearValidador(ESTADOS_ORDEN);
export const esTipoRetiro = crearValidador(TIPOS_RETIRO);
export const esTipoPago = crearValidador(TIPOS_PAGO);
export const esMetodoPago = crearValidador(METODOS_PAGO);
export const esMomentoItem = crearValidador(MOMENTOS_ITEM);
/** Para el filtro `?accion=` de la consulta de la auditoría — SPEC-ALE186-012. */
export const esAccionAuditoria = crearValidador(ACCIONES_AUDITORIA);

// ------------------------------------------------------------------
//  Cómo cambia una orden
// ------------------------------------------------------------------
//
//   RECIBIDO → ENTREGADO     (lo pone el registro de la entrega)
//   RECIBIDO → REEMBOLSADO   (lo pondrá la entrega sin cobrar, SPEC-KRILINXI-070)
//   RECIBIDO → ANULADO       (el único cambio que pide un empleado, por PATCH)
//
// Desde SPEC-KRILINXI-067 no hay pasos intermedios (EN_PROCESO y LISTO se
// quitaron): la ropa está recibida hasta que sale. ENTREGADO y REEMBOLSADO no
// están en la tabla como destino a propósito: no los pone un empleado cambiando
// un estado, los pone el registro de la entrega.

/** Los estados de los que ya no se sale. */
export const ESTADOS_CERRADOS: readonly EstadoOrden[] = ['ENTREGADO', 'REEMBOLSADO', 'ANULADO'];

/**
 * Los estados en los que la ropa sigue en el local: todos los que no están cerrados. Hoy, solo RECIBIDO.
 *
 * Una orden abierta se puede entregar y admite renglones nuevos (SPEC-KRILINXI-068). Vive acá, y no en un model, para
 * que el de entregas y el de renglones la compartan sin importarse entre sí.
 */
export const ESTADOS_ABIERTOS: readonly EstadoOrden[] = ESTADOS_ORDEN.filter(
  (estado) => !ESTADOS_CERRADOS.includes(estado),
);

/**
 * Desde qué estados se puede llegar a cada uno.
 *
 * Cada destino se incluye a sí mismo, y no es un descuido: es lo que hace
 * idempotente un reintento. Si "anular" se aplica pero la respuesta se pierde
 * por el camino, PowerSync reenvía el mismo cambio sobre una orden que ya está
 * en ANULADO. Rechazarlo con un 409 convertiría un reintento normal en un
 * error que el empleado tendría que atender.
 */
const ORIGENES: Record<EstadoOrden, readonly EstadoOrden[]> = {
  RECIBIDO: ['RECIBIDO'],
  ANULADO: ['RECIBIDO', 'ANULADO'],
  ENTREGADO: [],
  REEMBOLSADO: [],
};

/**
 * Los estados en los que tiene que estar una orden para aceptar un cambio.
 *
 * `destino` es el estado que pide el cambio, si pide alguno. `tocaOtrosCampos`
 * dice si además cambia descripción, precio, boleta o fecha: una orden cerrada
 * no se edita, así que en ese caso los estados cerrados quedan fuera aunque el
 * destino los admita (el reintento de una anulación pasa; editar una orden ya
 * anulada, no).
 */
export function estadosDeOrigen(
  destino: EstadoOrden | undefined,
  tocaOtrosCampos: boolean,
): EstadoOrden[] {
  const origenes = destino === undefined ? ESTADOS_ORDEN : ORIGENES[destino];
  return origenes.filter((estado) => !tocaOtrosCampos || !ESTADOS_CERRADOS.includes(estado));
}
