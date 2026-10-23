/**
 * Qué pide la consulta de la auditoría — SPEC-KRILINXI-018.
 *
 * Sin fechas elegidas, los últimos 30 días (igual que el backend sin `desde`, y que la historia
 * del panel de estadísticas). Los demás filtros solo se mandan si están puestos.
 */
import { DIAS_DE_HISTORIA, restarDias } from '../estadisticas/periodo';
import type { ParametrosAuditoria } from './api/auditoriaApi';
import { QUE_BUSCAR } from './describir';

export type FiltroAuditoria = {
  fechas: { desde: string; hasta: string } | null;
  usuarioId: string | null;
  sucursalId: string | null;
  /** El cliente elegido (SPEC-KRILINXI-062): con su nombre, que la tarjeta de cada registro usa para decir de quién es. */
  cliente: { id: string; nombre: string } | null;
  /** Una de las claves de `QUE_BUSCAR`, o null para todo. */
  que: string | null;
  soloParaRevisar: boolean;
};

export const FILTRO_INICIAL: FiltroAuditoria = {
  fechas: null,
  usuarioId: null,
  sucursalId: null,
  cliente: null,
  que: null,
  soloParaRevisar: false,
};

export function parametrosAuditoria(filtro: FiltroAuditoria, hoy: string): ParametrosAuditoria {
  const parametros: ParametrosAuditoria = filtro.fechas ?? { desde: restarDias(hoy, DIAS_DE_HISTORIA - 1), hasta: hoy };
  if (filtro.usuarioId) parametros.usuario_id = filtro.usuarioId;
  if (filtro.sucursalId) parametros.sucursal_id = filtro.sucursalId;
  if (filtro.cliente) parametros.cliente_id = filtro.cliente.id;
  const que = QUE_BUSCAR.find((q) => q.clave === filtro.que);
  if (que?.accion) parametros.accion = que.accion;
  if (que?.tabla) parametros.tabla = que.tabla;
  if (filtro.soloParaRevisar) parametros.revisar = 'true';
  return { ...parametros };
}
