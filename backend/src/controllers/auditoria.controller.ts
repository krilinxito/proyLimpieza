// Controller de la auditoría — SPEC-ALE186-012. Lee y valida los filtros de la
// query string, pide la página al model y arma la respuesta. No escribe SQL.
//
// Solo lo ve el ADMIN; lo exige la ruta con `requireRol('ADMIN')`, no este
// archivo. Como el dashboard (CLAUDE.md, sección 8), es una lectura online: la
// tabla `auditoria` no baja a ningún dispositivo (sección 7).
import type { Request, Response } from 'express';
import * as auditoria from '../models/auditoria.model.js';
import { esTablaAuditada, type Paginacion } from '../models/auditoria.model.js';
import { ApiError, CODIGOS_ERROR } from '../utils/ApiError.js';
import { esAccionAuditoria } from '../utils/dominio.js';
import { leerPeriodo } from '../utils/periodo.js';
import { esUuid } from '../utils/validacion.js';

const POR_PAGINA_POR_DEFECTO = 50;
const POR_PAGINA_MAXIMO = 200;

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
}

/** Un id opcional de la query string. */
function leerId(valor: unknown, mensaje: string): string | null {
  if (valor === undefined) return null;
  if (!esUuid(valor)) throw invalido(mensaje);
  return valor;
}

/**
 * Un entero positivo opcional de la query string. Llega como texto, así que se
 * exige que sea solo dígitos: `Number('1e2')` o `Number(' 3')` darían un número
 * que nadie escribió.
 */
function leerEntero(valor: unknown, porDefecto: number, maximo: number, mensaje: string): number {
  if (valor === undefined) return porDefecto;
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) throw invalido(mensaje);
  const numero = Number(valor);
  if (numero < 1 || numero > maximo) throw invalido(mensaje);
  return numero;
}

function leerPaginacion(query: Record<string, unknown>): Paginacion {
  return {
    pagina: leerEntero(query.pagina, 1, Number.MAX_SAFE_INTEGER, 'El número de página tiene que ser 1 o más.'),
    porPagina: leerEntero(
      query.por_pagina,
      POR_PAGINA_POR_DEFECTO,
      POR_PAGINA_MAXIMO,
      `Se pueden ver entre 1 y ${POR_PAGINA_MAXIMO} registros por página.`,
    ),
  };
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
