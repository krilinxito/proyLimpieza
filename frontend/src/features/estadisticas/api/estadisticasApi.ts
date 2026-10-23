/**
 * Las métricas del panel del admin, pedidas a la API — SPEC-KRILINXI-015 y SPEC-KRILINXI-016.
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
import { api, RespuestaRara } from '../../../lib/api';

export { RespuestaRara };

/** El mensaje de un error de las estadísticas que no trae el suyo (para `usePedidoOnline`). */
export const ERROR_ESTADISTICAS =
  'No se pudieron traer las estadísticas. Prueba de nuevo y, si sigue pasando, avísale al encargado.';

const INCOMPLETAS = 'Las estadísticas llegaron incompletas. Prueba de nuevo y, si sigue pasando, avísale al encargado.';
import { METODOS_PAGO } from '../../../lib/dominio';
import { POR_PAGINA_ANCHA } from '../../../lib/tamanoDePagina';
import type { Parametros } from '../periodo';
import {
  TRAMOS,
  type Atenciones,
  type ClientesAtendidos,
  type Ingresos,
  type IngresosPorDia,
  type Productividad,
  type Saldos,
  type SinRecoger,
  type Tramo,
  type Volumen,
} from '../types';

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

/** `/ingresos-por-dia` — SPEC-KRILINXI-043. Los cuatro montos de cada día tienen que estar, aunque sean "0.00". */
export function leerIngresosPorDia(datos: unknown): IngresosPorDia | null {
  if (!esObjeto(datos) || !esTexto(datos.desde) || !esTexto(datos.hasta) || !esMonto(datos.total)) return null;
  const porDia = lista(datos.porDia, (d) => {
    const { porMetodo } = d;
    if (!esFecha(d.fecha) || !esMonto(d.total) || !esObjeto(porMetodo)) return null;
    const montos = METODOS_PAGO.map((m) => porMetodo[m]);
    if (!montos.every(esMonto)) return null;
    return {
      fecha: d.fecha,
      total: d.total,
      porMetodo: { EFECTIVO: montos[0], QR: montos[1], TARJETA: montos[2], TRANSFERENCIA: montos[3] },
    };
  });
  if (!porDia) return null;
  return { desde: datos.desde, hasta: datos.hasta, total: datos.total, porDia };
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

const esFecha = (valor: unknown): valor is string => esTexto(valor) && /^\d{4}-\d{2}-\d{2}$/.test(valor);
const esEntero = (valor: unknown): valor is number => esNumero(valor) && Number.isInteger(valor) && valor >= 0;

/** `{ id, nombre }` de una sucursal, o null. */
function sucursalDe(valor: unknown): { id: string; nombre: string } | null {
  return esObjeto(valor) && esTexto(valor.id) && esTexto(valor.nombre) ? { id: valor.id, nombre: valor.nombre } : null;
}

export function leerVolumen(datos: unknown): Volumen | null {
  if (!esObjeto(datos) || !esTexto(datos.desde) || !esTexto(datos.hasta)) return null;
  if (!esEntero(datos.total) || !esEntero(datos.anuladas)) return null;
  const porDia = lista(datos.porDia, (d) =>
    esFecha(d.fecha) && esEntero(d.ordenes) && esEntero(d.anuladas) ? { fecha: d.fecha, ordenes: d.ordenes, anuladas: d.anuladas } : null,
  );
  if (!porDia) return null;
  return { desde: datos.desde, hasta: datos.hasta, total: datos.total, anuladas: datos.anuladas, porDia };
}

export function leerProductividad(datos: unknown): Productividad | null {
  if (!esObjeto(datos) || !esTexto(datos.desde) || !esTexto(datos.hasta)) return null;
  const porEmpleado = lista(datos.porEmpleado, (f) => {
    const { usuario } = f;
    const sucursal = sucursalDe(f.sucursal);
    if (!esObjeto(usuario) || !esTexto(usuario.id) || !esTexto(usuario.nombreCompleto) || !sucursal) return null;
    if (!esEntero(f.ordenesRecibidas) || !esEntero(f.cobros) || !esMonto(f.montoCobrado) || !esEntero(f.entregas)) return null;
    return {
      usuario: { id: usuario.id, nombreCompleto: usuario.nombreCompleto },
      sucursal,
      ordenesRecibidas: f.ordenesRecibidas,
      cobros: f.cobros,
      montoCobrado: f.montoCobrado,
      entregas: f.entregas,
    };
  });
  if (!porEmpleado) return null;
  return { desde: datos.desde, hasta: datos.hasta, porEmpleado };
}

/** Las tres cifras de una atención, o null. */
function atencionesDe(f: Objeto): Atenciones | null {
  return esEntero(f.ordenes) && esMonto(f.gastado) && esTexto(f.ultimaVisita)
    ? { ordenes: f.ordenes, gastado: f.gastado, ultimaVisita: f.ultimaVisita }
    : null;
}

export function leerClientes(datos: unknown): ClientesAtendidos | null {
  if (!esObjeto(datos) || !esTexto(datos.desde) || !esTexto(datos.hasta)) return null;
  if (!esEntero(datos.pagina) || !esEntero(datos.porPagina) || !esEntero(datos.total)) return null;
  const clientes = lista(datos.clientes, (c) => {
    const { cliente } = c;
    const totales = atencionesDe(c);
    if (!esObjeto(cliente) || !esTexto(cliente.id) || !esTexto(cliente.nombre) || !esTexto(cliente.telefono) || !totales) return null;
    const porSucursal = lista(c.porSucursal, (s) => {
      const sucursal = sucursalDe(s.sucursal);
      const enEsa = atencionesDe(s);
      return sucursal && enEsa ? { ...enEsa, sucursal } : null;
    });
    if (!porSucursal) return null;
    return { ...totales, cliente: { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono }, porSucursal };
  });
  if (!clientes) return null;
  return { desde: datos.desde, hasta: datos.hasta, pagina: datos.pagina, porPagina: datos.porPagina, total: datos.total, clientes };
}

async function pedir<T>(ruta: string, parametros: Parametros | ParametrosPaginados, leer: (datos: unknown) => T | null): Promise<T> {
  const { data } = await api.get<unknown>(ruta, { params: parametros });
  const leido = leer(data);
  if (leido === null) throw new RespuestaRara(INCOMPLETAS);
  return leido;
}

export const pedirIngresos = (parametros: Parametros) => pedir('/estadisticas/ingresos', parametros, leerIngresos);
export const pedirIngresosPorDia = (parametros: Parametros) => pedir('/estadisticas/ingresos-por-dia', parametros, leerIngresosPorDia);
export const pedirSaldos = (parametros: Parametros) => pedir('/estadisticas/saldos', parametros, leerSaldos);
export const pedirSinRecoger = (parametros: Parametros) => pedir('/estadisticas/sin-recoger', parametros, leerSinRecoger);
export const pedirVolumen = (parametros: Parametros) => pedir('/estadisticas/volumen', parametros, leerVolumen);
export const pedirProductividad = (parametros: Parametros) => pedir('/estadisticas/productividad', parametros, leerProductividad);

type ParametrosPaginados = Parametros & { pagina: number; por_pagina: number };

/**
 * Una página de clientes, desde 1. `porPagina` es lo que entra en la pantalla (`useTamanoDePagina`,
 * SPEC-KRILINXI-041); el backend admite hasta 200.
 */
export const pedirClientes = (parametros: Parametros, pagina: number, porPagina: number = POR_PAGINA_ANCHA) =>
  pedir('/estadisticas/clientes', { ...parametros, pagina, por_pagina: porPagina }, leerClientes);
