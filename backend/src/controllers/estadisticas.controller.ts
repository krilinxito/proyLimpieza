// Controller de estadísticas — SPEC-ALE186-008. Lee y valida el período de la
// query string, pide la agregación al model y arma la respuesta. No escribe SQL
// ni suma montos: eso es del model, que lo hace en Postgres.
//
// Solo lo ve el ADMIN; lo exige la ruta con `requireRol('ADMIN')`, no este archivo.
import type { Request, Response } from 'express';
import * as estadisticas from '../models/estadisticas.model.js';
import { hoyEnElNegocio, leerPeriodo } from '../utils/periodo.js';

// El período (`desde`, `hasta`, `sucursal_id`) se lee en `utils/periodo.ts`, que
// comparte con la consulta de la auditoría (SPEC-ALE186-012).

/** GET /api/estadisticas/ingresos */
export async function getIngresos(req: Request, res: Response): Promise<void> {
  const periodo = leerPeriodo(req.query);
  const resultado = await estadisticas.ingresos(periodo);
  res.json({ desde: periodo.desde, hasta: periodo.hasta, ...resultado });
}

/** GET /api/estadisticas/saldos */
export async function getSaldos(req: Request, res: Response): Promise<void> {
  const periodo = leerPeriodo(req.query);
  const resultado = await estadisticas.saldos(periodo, hoyEnElNegocio());
  res.json({ desde: periodo.desde, hasta: periodo.hasta, ...resultado });
}

/** GET /api/estadisticas/sin-recoger */
export async function getSinRecoger(req: Request, res: Response): Promise<void> {
  const periodo = leerPeriodo(req.query);
  const resultado = await estadisticas.sinRecoger(periodo, hoyEnElNegocio());
  res.json({ desde: periodo.desde, hasta: periodo.hasta, ...resultado });
}
