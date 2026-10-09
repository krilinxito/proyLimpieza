// Controller de la auditoría — SPEC-ALE186-012. Lee y valida los filtros de la
// query string, pide la página al model y arma la respuesta. No escribe SQL.
//
// Solo lo ve el ADMIN; lo exige la ruta con `requireRol('ADMIN')`, no este
// archivo. Como el dashboard (CLAUDE.md, sección 8), es una lectura online: la
// tabla `auditoria` no baja a ningún dispositivo (sección 7).
import type { Request, Response } from 'express';
import * as auditoria from '../models/auditoria.model.js';
import { esTablaAuditada } from '../models/auditoria.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { esAccionAuditoria } from '../utils/dominio.js';
import { leerPaginacion } from '../utils/paginacion.js';
import { leerPeriodo } from '../utils/periodo.js';
import { esUuid } from '../utils/validacion.js';

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

/** Un id opcional de la query string. */
function leerId(valor: unknown, mensaje: string): string | null {
  if (valor === undefined) return null;
  if (!esUuid(valor)) throw invalido(mensaje);
  return valor;
}

/** `?revisar=true` muestra solo lo marcado para revisión (SPEC-ALE186-018). */
function leerRevisar(valor: unknown): boolean {
  if (valor === undefined || valor === 'false') return false;
  if (valor === 'true') return true;
  throw invalido('Para ver solo lo que hay que revisar, usá revisar=true.');
}

/** GET /api/auditoria */
export async function getAuditoria(req: Request, res: Response): Promise<void> {
  const { query } = req;
  const periodo = leerPeriodo(query);

  const { accion, tabla } = query;
  if (accion !== undefined && !esAccionAuditoria(accion)) {
    throw invalido('Esa acción no existe. Elegí una de la lista.');
  }
  if (tabla !== undefined && !esTablaAuditada(tabla)) {
    throw invalido('Ese tipo de registro no existe. Elegí uno de la lista.');
  }

  const filtros = {
    ...periodo,
    usuarioId: leerId(query.usuario_id, 'La persona elegida no es válida. Volvé a elegirla de la lista.'),
    accion: accion ?? null,
    tabla: tabla ?? null,
    registroId: leerId(query.registro_id, 'El registro elegido no es válido.'),
    soloParaRevisar: leerRevisar(query.revisar),
  };
  const paginacion = leerPaginacion(query);

  const { total, registros } = await auditoria.consultar(filtros, paginacion);

  res.json({
    desde: periodo.desde,
    hasta: periodo.hasta,
    pagina: paginacion.pagina,
    porPagina: paginacion.porPagina,
    total,
    registros,
  });
}
