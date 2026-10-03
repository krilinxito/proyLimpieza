/**
 * La ropa de la sucursal en la base local: leerla, avanzarla, anularla y cobrarla —
 * SPEC-KRILINXI-008.
 *
 * Mismo patrón que `ordenesLocal.ts`: la base llega como argumento, todo es SQL sobre
 * SQLite y nada habla con la API. Los cambios quedan en la cola: avanzar y anular suben como
 * `PATCH /api/ordenes/:id` con solo el estado, y cobrar como `POST /api/pagos`.
 *
 * Aquí sí hay JOINs: la limitación de PowerSync es de las sync rules (qué baja), no de la
 * base local, que es SQLite normal (CLAUDE.md §7).
 */
import type { BaseLocal, Fila } from '../../../lib/powersync';
import { esEstadoOrden, esMetodoPago, esTipoPago, type EstadoOrden, type MetodoPago } from '../../../lib/dominio';
import { desdeDecimal, parsearMonto, sumar, type Centavos } from '../../../lib/money';
import { normalizarTelefono } from '../../clientes/telefono';
import { insertarPago } from '../../pagos/api/pagosLocal';
import { calcularSaldo } from '../../pagos/saldo';
import { estaCerrada, estadoEfectivo, puedePasarA } from '../estado';
import type { OrdenVista, PagoVisto, QuienRegistra, ResultadoAccion } from '../types';

export const MENSAJES_ACCION = {
  noEncontrada: 'No se encontró esa boleta en esta sucursal.',
  cerrada: 'Esta ropa ya fue entregada o anulada: no se puede cambiar.',
  avance: 'Esta ropa ya pasó por ese paso.',
  monto: 'Escribí cuánto paga el cliente, con números mayores que cero, por ejemplo 20 o 20,50.',
  montoMayor: 'El cobro no puede ser mayor que lo que falta pagar.',
  sinMetodo: 'Elegí cómo paga: efectivo, QR, tarjeta o transferencia.',
} as const;

// La orden con su cliente y su entrega. Los pagos se leen aparte: son varios por orden.
const SELECT_ORDENES = `
  SELECT o.id, o.numero_boleta, o.descripcion, o.estado, o.fecha_entrada, o.fecha_estimada_salida,
         o.precio_total, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
         e.id AS entrega_id, e.precio_final
    FROM ordenes o
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN entregas e ON e.orden_id = o.id
   WHERE o.sucursal_id = ?`;

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

/** Un monto guardado; un dato roto cuenta como cero en vez de romper la pantalla entera. */
function monto(valor: unknown): Centavos {
  const decimal = texto(valor);
  if (!decimal) return 0;
  try {
    return desdeDecimal(decimal);
  } catch {
    console.error(`Monto guardado inválido: "${decimal}".`);
    return 0;
  }
}

function aPago(fila: Fila): PagoVisto | null {
  const { id, tipo, metodo, fecha_pago } = fila;
  if (typeof id !== 'string' || !esTipoPago(tipo) || !esMetodoPago(metodo)) return null;
  return { id, tipo, metodo, monto: monto(fila.monto), fecha: texto(fecha_pago) };
}

/** Los pagos de varias órdenes de una sola consulta, agrupados por orden. */
async function pagosPorOrden(base: BaseLocal, ordenIds: string[]): Promise<Map<string, PagoVisto[]>> {
  const porOrden = new Map<string, PagoVisto[]>();
  if (ordenIds.length === 0) return porOrden;
  const filas = await base.consultar(
    `SELECT id, orden_id, tipo, metodo, monto, fecha_pago FROM pagos
      WHERE orden_id IN (${ordenIds.map(() => '?').join(', ')}) ORDER BY fecha_pago`,
    ordenIds,
  );
  for (const fila of filas) {
    const pago = aPago(fila);
    if (!pago || typeof fila.orden_id !== 'string') continue;
    porOrden.set(fila.orden_id, [...(porOrden.get(fila.orden_id) ?? []), pago]);
  }
  return porOrden;
}

/** Arma la vista de una orden. Una fila rota (sin estado válido) no se muestra. */
function aOrden(fila: Fila, pagos: PagoVisto[]): OrdenVista | null {
  const { id, numero_boleta, estado } = fila;
  if (typeof id !== 'string' || typeof numero_boleta !== 'string' || !esEstadoOrden(estado)) return null;

  const precioTotal = monto(fila.precio_total);
  const tieneEntrega = typeof fila.entrega_id === 'string';
  const precioFinal = tieneEntrega ? monto(fila.precio_final) : null;
  const montos = pagos.map((p) => p.monto);

  return {
    id,
    numeroBoleta: numero_boleta,
    descripcion: texto(fila.descripcion) ?? '',
    estado: estadoEfectivo(estado, tieneEntrega),
    clienteNombre: texto(fila.cliente_nombre) ?? 'Cliente sin nombre',
    clienteTelefono: texto(fila.cliente_telefono) ?? '',
    fechaEntrada: texto(fila.fecha_entrada),
    fechaEstimada: texto(fila.fecha_estimada_salida),
    precioTotal,
    precioFinal,
    pagado: sumar(...montos),
    saldo: calcularSaldo({ precioTotal, precioFinal, pagos: montos }),
    pagos,
  };
}

async function armar(base: BaseLocal, filas: Fila[]): Promise<OrdenVista[]> {
  const ids = filas.map((f) => f.id).filter((id): id is string => typeof id === 'string');
  const pagos = await pagosPorOrden(base, ids);
  return filas.flatMap((fila) => {
    const orden = aOrden(fila, typeof fila.id === 'string' ? (pagos.get(fila.id) ?? []) : []);
    return orden ? [orden] : [];
  });
}

/** La ropa que está en el local: abiertas, de la más vieja a la más nueva. */
export async function listarAbiertas(base: BaseLocal, sucursalId: string): Promise<OrdenVista[]> {
  const filas = await base.consultar(`${SELECT_ORDENES} ORDER BY o.fecha_entrada`, [sucursalId]);
  // Se filtra después de calcular el estado efectivo, no en el SQL: así la regla de "qué
  // está cerrado" vive en un solo lugar (`estado.ts`).
  return (await armar(base, filas)).filter((orden) => !estaCerrada(orden.estado));
}

/**
 * Busca por boleta o por teléfono del cliente, incluidas las entregadas y anuladas. Una
 * boleta también son dígitos, así que se prueba con las dos cosas a la vez.
 */
export async function buscarOrdenes(base: BaseLocal, sucursalId: string, buscado: string): Promise<OrdenVista[]> {
  const boleta = buscado.trim();
  const telefono = normalizarTelefono(buscado);
  if (boleta === '') return [];
  const filas = await base.consultar(
    `${SELECT_ORDENES} AND (o.numero_boleta = ? OR (? <> '' AND c.telefono = ?)) ORDER BY o.fecha_entrada DESC`,
    [sucursalId, boleta, telefono, telefono],
  );
  return armar(base, filas);
}

export async function obtenerOrden(base: BaseLocal, sucursalId: string, ordenId: string): Promise<OrdenVista | null> {
  const filas = await base.consultar(`${SELECT_ORDENES} AND o.id = ?`, [sucursalId, ordenId]);
  const [orden] = await armar(base, filas);
  return orden ?? null;
}

/**
 * Cambia el estado: un avance o la anulación. Nunca ENTREGADO, que no está en ningún
 * origen de la tabla: a ENTREGADO se llega registrando la entrega.
 */
export async function cambiarEstado(
  base: BaseLocal,
  sucursalId: string,
  ordenId: string,
  destino: EstadoOrden,
): Promise<ResultadoAccion> {
  const orden = await obtenerOrden(base, sucursalId, ordenId);
  if (!orden) return { tipo: 'no-se-puede', mensaje: MENSAJES_ACCION.noEncontrada };
  if (estaCerrada(orden.estado)) return { tipo: 'no-se-puede', mensaje: MENSAJES_ACCION.cerrada };
  if (!puedePasarA(orden.estado, destino)) return { tipo: 'no-se-puede', mensaje: MENSAJES_ACCION.avance };

  // Solo la columna estado: el PATCH lleva solo lo que cambió (SPEC-KRILINXI-007).
  await base.ejecutar('UPDATE ordenes SET estado = ? WHERE id = ? AND sucursal_id = ?', [destino, ordenId, sucursalId]);
  return { tipo: 'hecho' };
}

/** Un cobro antes de la entrega: un ADELANTO, contra lo que falta pagar. */
export async function cobrar(
  base: BaseLocal,
  quien: QuienRegistra,
  ordenId: string,
  datos: { monto: string; metodo: MetodoPago | null },
): Promise<ResultadoAccion> {
  const orden = await obtenerOrden(base, quien.sucursalId, ordenId);
  if (!orden) return { tipo: 'no-se-puede', mensaje: MENSAJES_ACCION.noEncontrada };
  if (estaCerrada(orden.estado)) return { tipo: 'no-se-puede', mensaje: MENSAJES_ACCION.cerrada };

  let cuanto: Centavos;
  try {
    cuanto = parsearMonto(datos.monto);
  } catch {
    return { tipo: 'no-se-puede', mensaje: MENSAJES_ACCION.monto };
  }
  if (cuanto <= 0) return { tipo: 'no-se-puede', mensaje: MENSAJES_ACCION.monto };
  if (cuanto > orden.saldo) return { tipo: 'no-se-puede', mensaje: MENSAJES_ACCION.montoMayor };
  if (!datos.metodo) return { tipo: 'no-se-puede', mensaje: MENSAJES_ACCION.sinMetodo };

  await insertarPago(base, {
    ordenId,
    sucursalId: quien.sucursalId,
    usuarioId: quien.usuarioId,
    monto: cuanto,
    tipo: 'ADELANTO',
    metodo: datos.metodo,
    fechaPago: new Date().toISOString(),
  });
  return { tipo: 'hecho' };
}
