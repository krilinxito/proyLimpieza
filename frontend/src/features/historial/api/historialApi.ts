/**
 * El historial completo de boletas, pedido a la API — SPEC-KRILINXI-041 (el contrato lo fijó
 * SPEC-KRILINXI-040).
 *
 * Es del admin: no tiene la ropa de las sucursales en la tablet (CLAUDE.md §7), así que la pide
 * online, como las estadísticas y la auditoría (§8). La respuesta se comprueba contra el contrato
 * antes de usarla (→ SPEC-KRILINXI-015, "comprobar una respuesta externa contra su contrato"): si no
 * encaja, `RespuestaRara`. Los montos llegan como texto (`"30.25"`) porque los suma Postgres; acá
 * solo se pasan a centavos para mostrarlos, no se suma nada.
 */
import { api, RespuestaRara } from '../../../lib/api';
import { esEstadoOrden, esMomentoItem, esTipoRetiro } from '../../../lib/dominio';
import { desdeDecimal } from '../../../lib/money';
import type { RenglonVisto } from '../../ordenes/types';
import { POR_PAGINA_ANCHA } from '../../../lib/tamanoDePagina';
import { fechaDelReembolsoDeLaApi, type Reembolso, type Retiro } from '../../ordenes/retiro';
import type { ParametrosHistorial } from '../filtro';
import type { BoletaListada, PaginaHistorial } from '../types';

export const ERROR_HISTORIAL = 'No se pudo traer el historial. Prueba de nuevo y, si sigue pasando, avísale al encargado.';
const INCOMPLETA = 'La lista llegó incompleta. Prueba de nuevo y, si sigue pasando, avísale al encargado.';

type Objeto = Record<string, unknown>;
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);
const esTexto = (v: unknown): v is string => typeof v === 'string';
const textoONulo = (v: unknown): v is string | null => v === null || esTexto(v);
const esEntero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Un monto `"12.50"`; null si no lo es (`desdeDecimal` lanza con lo que no entiende). */
function leerMonto(v: unknown): number | null {
  if (!esTexto(v)) return null;
  try {
    return desdeDecimal(v);
  } catch {
    return null;
  }
}

/** El retiro de una boleta entregada; undefined si no encaja con el contrato (null = sin entregar). */
function leerRetiro(r: unknown): Retiro | null | undefined {
  if (r === null) return null;
  if (!esObjeto(r) || !esTipoRetiro(r.tipo) || !textoONulo(r.nombre) || !textoONulo(r.carnet)) return undefined;
  return { tipo: r.tipo, nombre: r.nombre, carnet: r.carnet };
}

/** El reembolso de una boleta reembolsada; undefined si no encaja con el contrato (null = no es un reembolso). */
function leerReembolso(r: unknown): Reembolso | null | undefined {
  if (r === null) return null;
  if (!esObjeto(r) || !esTexto(r.motivo) || !textoONulo(r.hechoPor) || !textoONulo(r.fecha)) return undefined;
  return { motivo: r.motivo, hechoPor: r.hechoPor, fecha: r.fecha === null ? null : fechaDelReembolsoDeLaApi(r.fecha) };
}

/**
 * Un renglón de la boleta (SPEC-KRILINXI-068); null si no encaja. La cantidad también llega como texto decimal
 * (`"2.50"`) y se lee igual que un monto, en centésimas. El subtotal lo calculó Postgres: se muestra, no se recalcula.
 */
function leerRenglon(r: unknown): RenglonVisto | null {
  if (!esObjeto(r) || !esTexto(r.id) || !esMomentoItem(r.momento) || !esTexto(r.descripcion)) return null;
  const cantidad = leerMonto(r.cantidad);
  const precioUnitario = leerMonto(r.precioUnitario);
  const subtotal = leerMonto(r.subtotal);
  if (cantidad === null || precioUnitario === null || subtotal === null) return null;
  return { id: r.id, momento: r.momento, descripcion: r.descripcion, cantidad, precioUnitario, subtotal };
}

function leerBoleta(b: unknown): BoletaListada | null {
  if (!esObjeto(b) || !esTexto(b.id) || !esTexto(b.numeroBoleta) || !esTexto(b.descripcion)) return null;
  if (!esEstadoOrden(b.estado) || !esTexto(b.fechaEntrada) || !textoONulo(b.fechaEstimadaSalida)) return null;
  const { sucursal, cliente } = b;
  if (!esObjeto(sucursal) || !esTexto(sucursal.id) || !esTexto(sucursal.nombre)) return null;
  if (!esObjeto(cliente) || !esTexto(cliente.id) || !esTexto(cliente.nombre) || !esTexto(cliente.telefono)) return null;

  const precioTotal = leerMonto(b.precioTotal);
  const pagado = leerMonto(b.pagado);
  const saldo = leerMonto(b.saldo);
  const precioFinal = b.precioFinal === null ? null : leerMonto(b.precioFinal);
  if (precioTotal === null || pagado === null || saldo === null) return null;
  if (b.precioFinal !== null && precioFinal === null) return null;
  const retiro = leerRetiro(b.retiro);
  if (retiro === undefined) return null;
  const reembolso = leerReembolso(b.reembolso);
  if (reembolso === undefined) return null;
  if (!Array.isArray(b.renglones)) return null;
  const renglones = b.renglones.map(leerRenglon);
  if (renglones.some((r) => r === null)) return null;

  return {
    id: b.id,
    numeroBoleta: b.numeroBoleta,
    clienteId: cliente.id,
    clienteNombre: cliente.nombre,
    clienteTelefono: cliente.telefono,
    sucursalNombre: sucursal.nombre,
    descripcion: b.descripcion,
    estado: b.estado,
    // `YYYY-MM-DD HH:MM:SS` ya en la hora de Bolivia: el día son sus primeros diez caracteres.
    dia: b.fechaEntrada.slice(0, 10),
    precioTotal,
    precioFinal,
    retiro,
    reembolso,
    pagado,
    saldo,
    renglones: renglones.filter((r): r is RenglonVisto => r !== null),
  };
}

export function leerPagina(datos: unknown): PaginaHistorial | null {
  if (!esObjeto(datos) || !esEntero(datos.pagina) || !esEntero(datos.porPagina) || !esEntero(datos.total)) return null;
  if (!Array.isArray(datos.boletas)) return null;
  const boletas = datos.boletas.map(leerBoleta);
  // Todo o nada: una boleta rota no se esconde mostrando las demás.
  if (boletas.some((b) => b === null)) return null;
  return {
    pagina: datos.pagina,
    porPagina: datos.porPagina,
    total: datos.total,
    boletas: boletas.filter((b): b is BoletaListada => b !== null),
  };
}

/** Una página del historial. `porPagina` es lo que entra en la pantalla (`useTamanoDePagina`). */
export async function pedirHistorial(
  parametros: ParametrosHistorial,
  pagina: number,
  porPagina: number = POR_PAGINA_ANCHA,
): Promise<PaginaHistorial> {
  const { data } = await api.get<unknown>('/ordenes', { params: { ...parametros, pagina, por_pagina: porPagina } });
  const leida = leerPagina(data);
  if (!leida) throw new RespuestaRara(INCOMPLETA);
  return leida;
}
