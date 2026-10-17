/**
 * Las métricas del panel del admin, pedidas a la API — SPEC-KRILINXI-015.
 *
 * Es la única excepción a "todo se lee de la base local" (CLAUDE.md §8): sincronizar años de
 * cobros a un navegador solo para sumarlos no tiene sentido, y el admin trabaja con conexión.
 * Por eso este archivo **no toca** la base local (lo vigila `test/arquitectura.test.ts`): si
 * no hay internet, la pantalla tiene que decirlo, no mostrar lo que haya quedado en la tablet.
 *
 * Los errores llegan traducidos por `lib/api` (`ErrorApi`, `ErrorSinConexion`). Aquí se
 * comprueba que lo que volvió tiene la forma del contrato; si no, se lanza `RespuestaRara`
 * en vez de mostrar un panel a medias.
 */
import { api } from '../../../lib/api';
import { METODOS_PAGO } from '../../../lib/dominio';
import type { Parametros } from '../periodo';
import { TRAMOS, type Ingresos, type Saldos, type SinRecoger, type Tramo } from '../types';

export class RespuestaRara extends Error {
  constructor() {
    super('Las estadísticas llegaron incompletas. Probá de nuevo y, si sigue pasando, avisale al encargado.');
    this.name = 'RespuestaRara';
  }
}

type Objeto = Record<string, unknown>;

function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}
const esTexto = (valor: unknown): valor is string => typeof valor === 'string';
const esNumero = (valor: unknown): valor is number => typeof valor === 'number' && Number.isFinite(valor);
// Un monto del servidor: "125.50". Ni un número de JavaScript ni otro formato, ni negativo:
// en el panel no hay montos negativos, y `desdeDecimal` (para mostrarlos) no los acepta.
const esMonto = (valor: unknown): valor is string => esTexto(valor) && /^\d+\.\d{2}$/.test(valor);
const esTramo = (valor: unknown): valor is Tramo => TRAMOS.some((t) => t === valor);

/** Cada elemento de la lista, con la forma pedida; si uno no la tiene, la lista entera no vale. */
function lista<T>(valor: unknown, leer: (fila: Objeto) => T | null): T[] | null {
  if (!Array.isArray(valor)) return null;
  const filas: T[] = [];
  for (const elemento of valor) {
    const fila = esObjeto(elemento) ? leer(elemento) : null;
    if (fila === null) return null;
    filas.push(fila);
  }
  return filas;
}

export function leerIngresos(datos: unknown): Ingresos | null {
  if (!esObjeto(datos) || !esTexto(datos.desde) || !esTexto(datos.hasta) || !esMonto(datos.total)) return null;
  const porSucursal = lista(datos.porSucursal, (s) => {
    const { porMetodo } = s;
    if (!esTexto(s.sucursalId) || !esTexto(s.sucursal) || !esMonto(s.total) || !esObjeto(porMetodo)) return null;
    const montos = METODOS_PAGO.map((m) => porMetodo[m]);
    if (!montos.every(esMonto)) return null;
    return {
      sucursalId: s.sucursalId,
      sucursal: s.sucursal,
      total: s.total,
      porMetodo: { EFECTIVO: montos[0], QR: montos[1], TARJETA: montos[2], TRANSFERENCIA: montos[3] },
    };
  });
  if (!porSucursal) return null;
  return { desde: datos.desde, hasta: datos.hasta, total: datos.total, porSucursal };
}

export function leerSaldos(datos: unknown): Saldos | null {
  if (!esObjeto(datos) || !esTexto(datos.desde) || !esTexto(datos.hasta)) return null;
  if (!esMonto(datos.total) || !esNumero(datos.cantidad)) return null;
  const porAntiguedad = lista(datos.porAntiguedad, (t) =>
    esTramo(t.tramo) && esNumero(t.cantidad) && esMonto(t.total) ? { tramo: t.tramo, cantidad: t.cantidad, total: t.total } : null,
  );
  const ordenes = lista(datos.ordenes, (o) => {
    if (!esTexto(o.ordenId) || !esTexto(o.numeroBoleta) || !esTexto(o.cliente) || !esTexto(o.estado)) return null;
    if (!esMonto(o.montoACobrar) || !esMonto(o.totalPagado) || !esMonto(o.saldoPendiente) || !esNumero(o.dias)) return null;
    return {
      ordenId: o.ordenId,
      numeroBoleta: o.numeroBoleta,
      cliente: o.cliente,
      estado: o.estado,
      montoACobrar: o.montoACobrar,
      totalPagado: o.totalPagado,
      saldoPendiente: o.saldoPendiente,
      dias: o.dias,
    };
  });
  if (!porAntiguedad || !ordenes) return null;
  return { desde: datos.desde, hasta: datos.hasta, total: datos.total, cantidad: datos.cantidad, porAntiguedad, ordenes };
}

export function leerSinRecoger(datos: unknown): SinRecoger | null {
  if (!esObjeto(datos) || !esTexto(datos.desde) || !esTexto(datos.hasta) || !esNumero(datos.cantidad)) return null;
  const porAntiguedad = lista(datos.porAntiguedad, (t) =>
    esTramo(t.tramo) && esNumero(t.cantidad) ? { tramo: t.tramo, cantidad: t.cantidad } : null,
  );
  const ordenes = lista(datos.ordenes, (o) => {
    if (!esTexto(o.ordenId) || !esTexto(o.numeroBoleta) || !esTexto(o.cliente) || !esTexto(o.sucursal)) return null;
    if (!esMonto(o.precioTotal) || !esNumero(o.dias)) return null;
    return {
      ordenId: o.ordenId,
      numeroBoleta: o.numeroBoleta,
      cliente: o.cliente,
      // El teléfono y la descripción pueden faltar en una orden vieja: se muestran vacíos.
      telefono: esTexto(o.telefono) ? o.telefono : '',
      descripcion: esTexto(o.descripcion) ? o.descripcion : '',
      sucursal: o.sucursal,
      precioTotal: o.precioTotal,
      dias: o.dias,
    };
  });
  if (!porAntiguedad || !ordenes) return null;
  return { desde: datos.desde, hasta: datos.hasta, cantidad: datos.cantidad, porAntiguedad, ordenes };
}

async function pedir<T>(ruta: string, parametros: Parametros, leer: (datos: unknown) => T | null): Promise<T> {
  const { data } = await api.get<unknown>(ruta, { params: parametros });
  const leido = leer(data);
  if (leido === null) throw new RespuestaRara();
  return leido;
}

export const pedirIngresos = (parametros: Parametros) => pedir('/estadisticas/ingresos', parametros, leerIngresos);
export const pedirSaldos = (parametros: Parametros) => pedir('/estadisticas/saldos', parametros, leerSaldos);
export const pedirSinRecoger = (parametros: Parametros) => pedir('/estadisticas/sin-recoger', parametros, leerSinRecoger);
