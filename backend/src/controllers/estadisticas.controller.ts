// Controller de estadísticas — SPEC-ALE186-008. Lee y valida el período de la
// query string, pide la agregación al model y arma la respuesta. No escribe SQL
// ni suma montos: eso es del model, que lo hace en Postgres.
//
// Solo lo ve el ADMIN; lo exige la ruta con `requireRol('ADMIN')`, no este archivo.
import type { Request, Response } from 'express';
import * as estadisticas from '../models/estadisticas.model.js';
import { ZONA_NEGOCIO, type Periodo } from '../models/estadisticas.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { esFechaCalendario, esUuid } from '../utils/validacion.js';

/** Sin `desde`, el período son los últimos 30 días contando `hasta`. */
const DIAS_POR_DEFECTO = 30;

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

function leerPeriodo(req: Request): Periodo {
  const hasta = leerFecha(req.query.hasta, 'hasta') ?? hoyEnElNegocio();
  const desde = leerFecha(req.query.desde, 'desde') ?? restarDias(hasta, DIAS_POR_DEFECTO - 1);

  // Las dos son `YYYY-MM-DD`, así que compararlas como texto es compararlas como fechas.
  if (desde > hasta) throw invalido('La fecha "desde" no puede ser posterior a "hasta".');

  const { sucursal_id: sucursalId } = req.query;
  if (sucursalId !== undefined && !esUuid(sucursalId)) {
    throw invalido('La sucursal elegida no es válida. Volvé a elegirla de la lista.');
  }

  return { desde, hasta, sucursalId: sucursalId ?? null };
}

/** GET /api/estadisticas/ingresos */
export async function getIngresos(req: Request, res: Response): Promise<void> {
  const periodo = leerPeriodo(req);
  const resultado = await estadisticas.ingresos(periodo);
  res.json({ desde: periodo.desde, hasta: periodo.hasta, ...resultado });
}

/** GET /api/estadisticas/saldos */
export async function getSaldos(req: Request, res: Response): Promise<void> {
  const periodo = leerPeriodo(req);
  const resultado = await estadisticas.saldos(periodo, hoyEnElNegocio());
  res.json({ desde: periodo.desde, hasta: periodo.hasta, ...resultado });
}

/** GET /api/estadisticas/sin-recoger */
export async function getSinRecoger(req: Request, res: Response): Promise<void> {
  const periodo = leerPeriodo(req);
  const resultado = await estadisticas.sinRecoger(periodo, hoyEnElNegocio());
  res.json({ desde: periodo.desde, hasta: periodo.hasta, ...resultado });
}
