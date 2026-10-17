/** Un registro que el servidor rechazó, como lo ve el mostrador — SPEC-KRILINXI-007 y 013. */
export type RegistroParaCorregir = {
  id: string;
  /** Qué era, en palabras: "Ropa con la boleta 001234", "Cobro de Bs 20,00". */
  que: string;
  /** Por qué no se guardó: el mensaje del servidor, ya escrito para el mostrador. */
  mensaje: string;
  /** Cuándo se intentó guardar, en ISO 8601. */
  fecha: string;
  /** Lo que hace falta para corregirlo (SPEC-KRILINXI-013): de qué tabla y fila era, */
  tabla: string;
  registroId: string;
  /** si era un alta (PUT) o una edición (PATCH), */
  operacion: string;
  /** y lo que se intentó subir. */
  datos: Record<string, unknown>;
};
