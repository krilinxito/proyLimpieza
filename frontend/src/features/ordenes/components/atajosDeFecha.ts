/**
 * Los atajos de "Para cuándo estará lista" — SPEC-KRILINXI-048. En vez de abrir el selector de fecha
 * del navegador (incómodo en una tablet), un toque: "Mañana", "En 3 días", "En una semana".
 *
 * Puro: recibe el día de hoy (`YYYY-MM-DD`, el de Bolivia, de `hoyEnBolivia()`) y devuelve fechas con
 * el mismo formato, que es lo que guarda y valida el formulario.
 */
export type Atajo = { texto: string; fecha: string };

const ATAJOS: { texto: string; dias: number }[] = [
  { texto: 'Mañana', dias: 1 },
  { texto: 'En 3 días', dias: 3 },
  { texto: 'En una semana', dias: 7 },
];

/** Un día `YYYY-MM-DD` más `dias` días. Se hace en UTC: sumar días de calendario no depende de ninguna zona. */
export function sumarDias(dia: string, dias: number): string {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number);
  const suma = new Date(Date.UTC(anio ?? 0, (mes ?? 1) - 1, (diaDelMes ?? 1) + dias));
  return suma.toISOString().slice(0, 10);
}

export function atajosDeFecha(hoy: string): Atajo[] {
  return ATAJOS.map(({ texto, dias }) => ({ texto, fecha: sumarDias(hoy, dias) }));
}
