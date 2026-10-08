// La paginación de las listas largas del admin.
//
// Nació en la consulta de la auditoría (SPEC-ALE186-012) y se movió acá en
// SPEC-ALE186-017, cuando las estadísticas de clientes necesitaron exactamente lo
// mismo. Como el período (`utils/periodo.ts`): un solo sitio, para que dos
// pantallas no entiendan distinto el mismo `?pagina=2&por_pagina=50`.
import { ApiError, CODIGOS_ERROR } from './ApiError.js';

export const POR_PAGINA_POR_DEFECTO = 50;
export const POR_PAGINA_MAXIMO = 200;

export interface Paginacion {
  /** Desde 1. */
  pagina: number;
  porPagina: number;
}

function invalido(mensaje: string): ApiError {
  return new ApiError(400, CODIGOS_ERROR.VALIDACION, mensaje);
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

/** `pagina` y `por_pagina` de la query string, validados. */
export function leerPaginacion(query: Record<string, unknown>): Paginacion {
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

/** Cuántas filas saltear para llegar a la página pedida (el OFFSET del SQL). */
export function salteo(paginacion: Paginacion): number {
  return (paginacion.pagina - 1) * paginacion.porPagina;
}
