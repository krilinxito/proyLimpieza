/**
 * Los valores válidos del negocio, en un solo sitio.
 *
 * En Postgres son ENUM (`context/lavanderia_schema.sql`, sección 0). SQLite no tiene ENUM,
 * así que al dispositivo llegan como texto suelto: sin este módulo, nada impediría escribir
 * `'EN PROCESO'` con un espacio y descubrirlo cuando el servidor rechace la subida.
 *
 * Validar aquí es cortesía, para que el empleado se entere al momento. La garantía la da el
 * backend, que vuelve a validar al recibir la escritura (CLAUDE.md §6).
 *
 * `dominio.test.ts` compara estas listas con el schema: si una cambia sin la otra, falla.
 */

// `as const` convierte la lista en una tupla de literales: TypeScript sabe que el primer
// valor es exactamente 'RECIBIDO', no un `string` cualquiera. De ahí sale el tipo.
export const ESTADOS_ORDEN = ['RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'ANULADO'] as const;
export const TIPOS_RETIRO = ['CON_BOLETA', 'SIN_BOLETA'] as const;
export const TIPOS_PAGO = ['ADELANTO', 'PAGO_FINAL'] as const;
export const METODOS_PAGO = ['EFECTIVO', 'QR', 'TARJETA', 'TRANSFERENCIA'] as const;
export const ROLES = ['ADMIN', 'EMPLEADO'] as const;

// `(typeof LISTA)[number]` es "el tipo de cualquier elemento de la lista": la unión
// 'RECIBIDO' | 'EN_PROCESO' | … Añadir un valor a la lista lo añade al tipo.
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];
export type TipoRetiro = (typeof TIPOS_RETIRO)[number];
export type TipoPago = (typeof TIPOS_PAGO)[number];
export type MetodoPago = (typeof METODOS_PAGO)[number];
export type Rol = (typeof ROLES)[number];

/**
 * Fabrica un "type guard": una función que devuelve boolean y, cuando da `true`, le dice a
 * TypeScript que el valor es de ese tipo. Así lo que llega de SQLite pasa de `unknown` a
 * `EstadoOrden` comprobándolo de verdad, sin `as` que lo afirme a ciegas.
 */
function crearValidador<const T extends readonly string[]>(valores: T) {
  return (valor: unknown): valor is T[number] => valores.some((v) => v === valor);
}

export const esEstadoOrden = crearValidador(ESTADOS_ORDEN);
export const esTipoRetiro = crearValidador(TIPOS_RETIRO);
export const esTipoPago = crearValidador(TIPOS_PAGO);
export const esMetodoPago = crearValidador(METODOS_PAGO);
export const esRol = crearValidador(ROLES);

// Lo que ve el empleado: nunca el código (CLAUDE.md §9). `Record<EstadoOrden, string>`
// obliga a que estén todos: si se añade un estado y falta su texto, no compila.
export const TEXTO_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  RECIBIDO: 'Recibido',
  EN_PROCESO: 'En proceso',
  LISTO: 'Listo para retirar',
  ENTREGADO: 'Entregado',
  ANULADO: 'Anulado',
};

export const TEXTO_TIPO_RETIRO: Record<TipoRetiro, string> = {
  CON_BOLETA: 'Trae la boleta',
  SIN_BOLETA: 'No trae la boleta',
};

export const TEXTO_TIPO_PAGO: Record<TipoPago, string> = {
  ADELANTO: 'Adelanto',
  PAGO_FINAL: 'Pago al retirar',
};

export const TEXTO_METODO_PAGO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  QR: 'Pago con QR',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
};

export const TEXTO_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  EMPLEADO: 'Empleado',
};
