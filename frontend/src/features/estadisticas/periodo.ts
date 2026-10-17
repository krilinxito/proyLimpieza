/**
 * Qué período piden las estadísticas — SPEC-KRILINXI-015.
 *
 * Las fechas son días de Bolivia, como las lee el backend (`backend/src/utils/periodo.ts`,
 * CLAUDE.md §8). Sin que el admin elija nada, el panel arranca con:
 *
 *  - **los ingresos de hoy**, que es la caja del día;
 *  - **todo lo pendiente** (saldos y ropa sin recoger), sin importar cuándo entró la ropa.
 *    El backend filtra esas dos por `fecha_entrada`: con "hoy", una deuda de hace un mes no
 *    aparecería, y el tramo "más de 30 días" quedaría siempre en cero.
 *
 * Cuando el admin elige fechas, las tres secciones usan esas.
 */
import { ahoraOficialMs } from '../../lib/reloj';

export const ZONA_NEGOCIO = 'America/La_Paz';

/**
 * El primer día que pide "todo lo pendiente". El backend, sin `desde`, usa los últimos 30
 * días: para ver todo hay que pedir desde una fecha anterior a cualquier ropa del negocio.
 */
export const DESDE_SIEMPRE = '2000-01-01';

/** Lo que eligió el admin: nada todavía (lo inicial), o unas fechas. */
export type Filtro = {
  fechas: { desde: string; hasta: string } | null;
  /** null: las tres sucursales. */
  sucursalId: string | null;
};

export const FILTRO_INICIAL: Filtro = { fechas: null, sucursalId: null };

/** Los parámetros de una petición a `/api/estadisticas/*`. */
export type Parametros = { desde: string; hasta: string; sucursal_id?: string };

/** Hoy en Bolivia, como `YYYY-MM-DD`, con la hora corregida de la tablet (SPEC-KRILINXI-012). */
export function hoyEnBolivia(ahoraMs: number = ahoraOficialMs()): string {
  // `en-CA` escribe las fechas como año-mes-día, que es el formato que pide el backend.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(ahoraMs),
  );
}

function conSucursal(base: { desde: string; hasta: string }, sucursalId: string | null): Parametros {
  return sucursalId ? { ...base, sucursal_id: sucursalId } : base;
}

/** Para los ingresos: las fechas elegidas, o solo hoy. */
export function parametrosIngresos(filtro: Filtro, hoy: string): Parametros {
  return conSucursal(filtro.fechas ?? { desde: hoy, hasta: hoy }, filtro.sucursalId);
}

/** Para saldos y ropa sin recoger: las fechas elegidas, o todo hasta hoy. */
export function parametrosPendientes(filtro: Filtro, hoy: string): Parametros {
  return conSucursal(filtro.fechas ?? { desde: DESDE_SIEMPRE, hasta: hoy }, filtro.sucursalId);
}

/** "2026-10-16" → "16/10/2026": como se lee una fecha en el mostrador. */
export function fechaParaLeer(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : fecha;
}

/** Lo que dice el título de cada sección: qué período está mirando. */
export function describirPeriodo(filtro: Filtro, seccion: 'ingresos' | 'pendientes'): string {
  if (filtro.fechas) {
    const { desde, hasta } = filtro.fechas;
    return desde === hasta ? `del ${fechaParaLeer(desde)}` : `del ${fechaParaLeer(desde)} al ${fechaParaLeer(hasta)}`;
  }
  return seccion === 'ingresos' ? 'de hoy' : 'hasta hoy';
}

export const MENSAJES_PERIODO = {
  faltaFecha: 'Elegí las dos fechas: desde cuándo y hasta cuándo.',
  alReves: 'La fecha «desde» no puede ser posterior a «hasta». Revisalas y volvé a elegirlas.',
} as const;

/** Las fechas que escribió el admin, o el error que hay que mostrarle. */
export function validarFechas(desde: string, hasta: string): { desde: string; hasta: string } | { error: string } {
  const valida = /^\d{4}-\d{2}-\d{2}$/;
  if (!valida.test(desde) || !valida.test(hasta)) return { error: MENSAJES_PERIODO.faltaFecha };
  // Las dos son `YYYY-MM-DD`: compararlas como texto es compararlas como fechas.
  if (desde > hasta) return { error: MENSAJES_PERIODO.alReves };
  return { desde, hasta };
}
