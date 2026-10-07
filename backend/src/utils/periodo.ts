// El período de las consultas del admin, en la hora del negocio.
//
// Nació dentro de las estadísticas (SPEC-ALE186-008) y se movió acá en
// SPEC-ALE186-012, cuando la consulta de la auditoría necesitó exactamente lo
// mismo: `desde` y `hasta` como días de Bolivia, por defecto los últimos 30, y
// "hoy" también en Bolivia. Un solo sitio, para que las dos pantallas del admin
// no puedan entender distinto el mismo `?desde=2025-06-30`.
import { ApiError, CODIGOS_ERROR } from './ApiError.js';
import { esFechaCalendario, esUuid } from './validacion.js';

/** La zona horaria del negocio: las tres sucursales están en Bolivia. */
export const ZONA_NEGOCIO = 'America/La_Paz';

/** Sin `desde`, el período son los últimos 30 días contando `hasta`. */
const DIAS_POR_DEFECTO = 30;

export interface Periodo {
  /** `YYYY-MM-DD`, incluido. */
  desde: string;
  /** `YYYY-MM-DD`, incluido. */
  hasta: string;
  /** `null` = todas las sucursales. */
  sucursalId: string | null;
}

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

/**
 * La fecha de hoy en la hora del negocio, `YYYY-MM-DD`.
 *
 * No sirve `new Date().toISOString().slice(0, 10)`: eso es el día en UTC, y entre
 * las 20:00 y la medianoche de Bolivia ya sería mañana. El formato `en-CA` es el
 * que escribe las fechas como `2025-06-30`.
 */
export function hoyEnElNegocio(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** `YYYY-MM-DD` menos `dias` días. Se calcula en UTC, que no tiene cambios de hora. */
function restarDias(fecha: string, dias: number): string {
  const enUtc = new Date(`${fecha}T00:00:00Z`);
  enUtc.setUTCDate(enUtc.getUTCDate() - dias);
  return enUtc.toISOString().slice(0, 10);
}

/** Una fecha opcional de la query string. */
function leerFecha(valor: unknown, nombre: 'desde' | 'hasta'): string | null {
  if (valor === undefined) return null;
  // Repetida (`?desde=…&desde=…`) llega como array y no pasa esta comprobación.
  if (!esFechaCalendario(valor)) {
    throw invalido(`La fecha "${nombre}" no es válida. Escribila como año-mes-día, por ejemplo 2025-06-30.`);
  }
  return valor;
}

/**
 * `desde`, `hasta` y `sucursal_id` de la query string, validados.
 *
 * Recibe `req.query` y no el `req` entero: no necesita más, y así se prueba sin
 * armar una petición.
 */
export function leerPeriodo(query: Record<string, unknown>): Periodo {
  const hasta = leerFecha(query.hasta, 'hasta') ?? hoyEnElNegocio();
  const desde = leerFecha(query.desde, 'desde') ?? restarDias(hasta, DIAS_POR_DEFECTO - 1);

  // Las dos son `YYYY-MM-DD`, así que compararlas como texto es compararlas como fechas.
  if (desde > hasta) throw invalido('La fecha "desde" no puede ser posterior a "hasta".');

  const { sucursal_id: sucursalId } = query;
  if (sucursalId !== undefined && !esUuid(sucursalId)) {
    throw invalido('La sucursal elegida no es válida. Volvé a elegirla de la lista.');
  }

  return { desde, hasta, sucursalId: sucursalId ?? null };
}

/**
 * El instante, en el reloj del negocio, de una columna TIMESTAMP (sin zona).
 * Es un fragmento de SQL: lo usan los models, nunca un controller.
 *
 * Esas columnas guardan la hora "de reloj" de la sesión de Postgres: el backend
 * las escribe con LOCALTIMESTAMP o pasando por `timestamptz` (SPEC-ALE186-003).
 * En este servidor la sesión está en UTC, así que un cobro de las 21:00 en
 * Bolivia queda guardado como las 01:00 del día siguiente. Para saber a qué día
 * del negocio pertenece hay que hacer dos pasos:
 *
 *   1. `col AT TIME ZONE current_setting('TimeZone')`: "esta hora está en la zona
 *      de la sesión" → un instante absoluto (timestamptz).
 *   2. `… AT TIME ZONE $zona`: ese instante, en el reloj de Bolivia.
 *
 * Se usa `current_setting('TimeZone')` y no 'UTC' escrito a mano para que siga
 * siendo correcto si el servidor de producción tiene otra zona. Con `::date`
 * delante da el día; sin él, la hora completa.
 */
export function horaDelNegocio(columna: string, parametroZona: string): string {
  return `((${columna} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE ${parametroZona})`;
}
