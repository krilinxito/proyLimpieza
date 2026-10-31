/**
 * Qué día es en el negocio — SPEC-KRILINXI-015 (en estadísticas), pasado a `lib/` en
 * SPEC-KRILINXI-035, cuando el Inicio también necesitó saber qué es "hoy".
 *
 * El negocio está en Bolivia: "hoy" es el día de La Paz, con la hora corregida de la tablet
 * (SPEC-KRILINXI-012), no el de la tablet ni el del servidor (que está en UTC, CLAUDE.md §8).
 */
import { ahoraOficialMs } from './reloj';

export const ZONA_NEGOCIO = 'America/La_Paz';

/** El día de Bolivia de un instante, como `YYYY-MM-DD`. */
export function diaEnBolivia(instanteMs: number): string {
  // `en-CA` escribe las fechas como año-mes-día, que es el formato que pide el backend.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(instanteMs),
  );
}

/**
 * El día y la hora de Bolivia de un instante, escritos para leer: `31/10/2026 14:30` — SPEC-KRILINXI-070. Para mostrar
 * cuándo pasó algo (la hora no se usa para decidir nada).
 */
export function fechaYHoraEnBolivia(instanteMs: number): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instanteMs));
  const de = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${de('day')}/${de('month')}/${de('year')} ${de('hour')}:${de('minute')}`;
}

/** Hoy en Bolivia, como `YYYY-MM-DD`, con la hora corregida de la tablet. */
export function hoyEnBolivia(ahoraMs: number = ahoraOficialMs()): string {
  return diaEnBolivia(ahoraMs);
}

/**
 * Un instante guardado en la base local, en milisegundos; null si no se entiende.
 *
 * Llegan en dos formatos, los dos en UTC:
 *  - lo escrito en la tablet, con zona: `2026-10-18T22:00:00.000Z` (`horaOficial()`);
 *  - lo que bajó del servidor, **sin zona**: `2026-10-18 22:00:00`. Es una columna `TIMESTAMP`
 *    de Postgres, que guarda la hora de la sesión, y el servidor está en UTC (CLAUDE.md §8).
 *
 * `new Date()` leería el segundo como hora **local** de la tablet, cuatro horas corrido: por eso,
 * sin zona, se le agrega la de UTC.
 */
export function instanteGuardado(texto: string): number | null {
  const conT = texto.trim().replace(' ', 'T');
  const conZona = /(Z|[+-]\d{2}:?\d{2})$/.test(conT) ? conT : `${conT}Z`;
  const ms = new Date(conZona).getTime();
  return Number.isNaN(ms) ? null : ms;
}
