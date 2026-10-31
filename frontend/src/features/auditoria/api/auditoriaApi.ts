/**
 * La auditoría, pedida a la API — SPEC-KRILINXI-018.
 *
 * `auditoria` no baja a ningún dispositivo (CLAUDE.md §7): se lee online, solo el admin. La
 * respuesta se comprueba contra el contrato antes de usarla (→ SPEC-KRILINXI-015, "comprobar una
 * respuesta externa contra su contrato"); si no encaja, `RespuestaRara`.
 */
import { api, RespuestaRara } from '../../../lib/api';
import { POR_PAGINA_ANCHA } from '../../../lib/tamanoDePagina';
import { ACCIONES, TABLAS, type Accion, type PaginaAuditoria, type RegistroAuditoria, type Tabla } from '../types';

export const ERROR_AUDITORIA = 'No se pudo traer quién hizo qué. Prueba de nuevo y, si sigue pasando, avísale al encargado.';
const INCOMPLETA = 'La consulta llegó incompleta. Prueba de nuevo y, si sigue pasando, avísale al encargado.';

type Objeto = Record<string, unknown>;
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);
const esTexto = (v: unknown): v is string => typeof v === 'string';
const textoONulo = (v: unknown): v is string | null => v === null || esTexto(v);
const esEntero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const esAccion = (v: unknown): v is Accion => ACCIONES.some((a) => a === v);
const esTabla = (v: unknown): v is Tabla => TABLAS.some((t) => t === v);

function leerRegistro(r: unknown): RegistroAuditoria | null {
  if (!esObjeto(r) || !esTexto(r.id) || !esTexto(r.fecha) || !esAccion(r.accion) || !esTabla(r.tablaAfectada)) return null;
  if (!textoONulo(r.registroId) || !textoONulo(r.sucursalId) || !textoONulo(r.fechaDelHecho) || !textoONulo(r.revision)) return null;
  // Un servidor que todavía no manda el motivo (SPEC-KRILINXI-070) es como uno que no tiene reembolsos.
  const motivoReembolso = r.motivoReembolso ?? null;
  if (!textoONulo(motivoReembolso)) return null;
  const { usuario, valoresAnteriores } = r;
  if (!esObjeto(usuario) || !esTexto(usuario.id) || !esTexto(usuario.nombreCompleto) || !esTexto(usuario.username)) return null;
  if (valoresAnteriores !== null && !esObjeto(valoresAnteriores)) return null;
  return {
    id: r.id,
    fecha: r.fecha,
    accion: r.accion,
    tablaAfectada: r.tablaAfectada,
    registroId: r.registroId,
    sucursalId: r.sucursalId,
    fechaDelHecho: r.fechaDelHecho,
    revision: r.revision,
    motivoReembolso,
    valoresAnteriores,
    usuario: { id: usuario.id, nombreCompleto: usuario.nombreCompleto, username: usuario.username },
  };
}

export function leerPagina(datos: unknown): PaginaAuditoria | null {
  if (!esObjeto(datos) || !esTexto(datos.desde) || !esTexto(datos.hasta)) return null;
  if (!esEntero(datos.pagina) || !esEntero(datos.porPagina) || !esEntero(datos.total) || !Array.isArray(datos.registros)) return null;
  const registros = datos.registros.map(leerRegistro);
  // Todo o nada: un registro roto no se esconde mostrando los demás.
  if (registros.some((r) => r === null)) return null;
  return {
    desde: datos.desde,
    hasta: datos.hasta,
    pagina: datos.pagina,
    porPagina: datos.porPagina,
    total: datos.total,
    registros: registros.filter((r): r is RegistroAuditoria => r !== null),
  };
}

/** Los filtros como los entiende la API. Solo se mandan los que están puestos. */
export type ParametrosAuditoria = {
  desde: string;
  hasta: string;
  usuario_id?: string;
  sucursal_id?: string;
  cliente_id?: string;
  accion?: Accion;
  tabla?: Tabla;
  revisar?: 'true';
};

/** Una página de la auditoría. `porPagina` es lo que entra en la pantalla (`useTamanoDePagina`, SPEC-KRILINXI-041). */
export async function pedirAuditoria(
  parametros: ParametrosAuditoria,
  pagina: number,
  porPagina: number = POR_PAGINA_ANCHA,
): Promise<PaginaAuditoria> {
  const { data } = await api.get<unknown>('/auditoria', { params: { ...parametros, pagina, por_pagina: porPagina } });
  const leida = leerPagina(data);
  if (!leida) throw new RespuestaRara(INCOMPLETA);
  return leida;
}
