/**
 * Qué boletas mirar en el historial — SPEC-KRILINXI-041. Lo que la persona eligió en pantalla;
 * `FILTRO_INICIAL` es "nada elegido".
 */
import type { EstadoOrden } from '../../lib/dominio';
import { alcanzaParaBuscar } from '../../lib/texto';

export type FiltroHistorial = {
  /** Lo que se escribe en el buscador: número de boleta, nombre o teléfono del cliente. */
  texto: string;
  estado: EstadoOrden | null;
  /** null: las que mira cada pantalla por defecto (30 días en la sucursal, todo para el admin). */
  fechas: { desde: string; hasta: string } | null;
  /** Solo las que todavía se deben. */
  conSaldo: boolean;
  /** Solo para el admin. null: todas las sucursales. */
  sucursalId: string | null;
};

export const FILTRO_INICIAL: FiltroHistorial = {
  texto: '',
  estado: null,
  fechas: null,
  conSaldo: false,
  sucursalId: null,
};

/** Si hay algo elegido: lo que decide si se ofrece "Limpiar filtros". */
export function hayFiltros(filtro: FiltroHistorial): boolean {
  return (
    filtro.texto.trim() !== '' ||
    filtro.estado !== null ||
    filtro.fechas !== null ||
    filtro.conSaldo ||
    filtro.sucursalId !== null
  );
}

/**
 * Lo escrito, si alcanza para buscar (`alcanzaParaBuscar`, la regla de SPEC-KRILINXI-032): con una
 * sola letra cualquier boleta coincide, y la lista se vaciaría y volvería a llenar en cada tecla
 * sin ayudar a nadie. Vacío si todavía no alcanza. Las dos fuentes usan esta misma regla.
 */
export function textoParaBuscar(filtro: FiltroHistorial): string {
  const texto = filtro.texto.trim();
  return alcanzaParaBuscar(texto) ? texto : '';
}

/** Los parámetros de `GET /api/ordenes`. Solo se mandan los que están puestos. */
export type ParametrosHistorial = {
  desde?: string;
  hasta?: string;
  sucursal_id?: string;
  estado?: EstadoOrden;
  texto?: string;
  con_saldo?: 'true';
};

export function parametrosHistorial(filtro: FiltroHistorial): ParametrosHistorial {
  const texto = textoParaBuscar(filtro);
  return {
    ...(filtro.fechas ? { desde: filtro.fechas.desde, hasta: filtro.fechas.hasta } : {}),
    ...(filtro.sucursalId ? { sucursal_id: filtro.sucursalId } : {}),
    ...(filtro.estado ? { estado: filtro.estado } : {}),
    ...(texto !== '' ? { texto } : {}),
    ...(filtro.conSaldo ? { con_saldo: 'true' as const } : {}),
  };
}
