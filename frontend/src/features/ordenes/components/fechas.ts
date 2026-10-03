/**
 * Fechas como se escriben a mano en el mostrador — SPEC-KRILINXI-008. Las usan el resumen
 * del registro y el detalle de la ropa.
 */

/** "2026-10-10" → "10/10/2026". Para fechas de calendario, sin hora. */
export function fechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Un instante ISO → "01/10/2026", en la hora de la tablet. */
export function diaDe(instante: string): string {
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;
}
