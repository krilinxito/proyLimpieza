/**
 * Si los gráficos se animan al aparecer — SPEC-KRILINXI-063. No se animan para quien pidió menos movimiento
 * (`prefers-reduced-motion`, una opción de accesibilidad del sistema) ni en los tests, donde una barra a medio
 * crecer haría depender cada prueba del reloj.
 */
export function animar(): boolean {
  if (import.meta.env.MODE === 'test') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
