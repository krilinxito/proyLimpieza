/**
 * Cómo se dice el estado de la conexión — SPEC-KRILINXI-007, separado en SPEC-KRILINXI-031.
 *
 * En un solo lugar, porque hoy lo dicen dos piezas: la píldora de la cabecera (la versión corta)
 * y el aviso grande o el detalle de la píldora (la frase completa). Si cada una tuviera su texto,
 * tarde o temprano dirían cosas distintas sobre lo mismo.
 */
export type EstadoConexion = {
  conectado: boolean;
  /** Registros escritos en la tablet que todavía no llegaron al servidor. */
  pendientes: number;
};

/** "1 registro" / "3 registros": la palabra bien escrita, no un "registro(s)". */
export function cuantos(n: number): string {
  return n === 1 ? '1 registro' : `${n} registros`;
}

/** La frase completa, la de siempre: "Trabajando sin internet — 3 registros se guardarán…". */
export function fraseConexion({ conectado, pendientes }: EstadoConexion): string {
  const seGuarda = pendientes === 1 ? 'se guardará' : 'se guardarán';
  if (!conectado && pendientes > 0) {
    return `Trabajando sin internet — ${cuantos(pendientes)} ${seGuarda} cuando vuelva la conexión.`;
  }
  if (!conectado) return 'Trabajando sin internet — lo que registres se guardará cuando vuelva la conexión.';
  if (pendientes > 0) return `Con internet — guardando ${cuantos(pendientes)}…`;
  return 'Con internet — todo está guardado.';
}

/** La versión corta, para la píldora de la cabecera: "Sin internet · 3 por guardar". */
export function resumenConexion({ conectado, pendientes }: EstadoConexion): string {
  if (!conectado) return pendientes > 0 ? `Sin internet · ${pendientes} por guardar` : 'Sin internet';
  return pendientes > 0 ? `Con internet · guardando ${pendientes}` : 'Con internet';
}
