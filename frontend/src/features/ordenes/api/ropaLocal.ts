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
import {
  esMetodoPago,
  esTipoPago,
  esTipoRetiro,
  type EstadoOrden,
  type MetodoPago,
} from '../../../lib/dominio';
import { desdeDecimal, parsearMonto, sumar, type Centavos } from '../../../lib/money';
import { horaOficial } from '../../../lib/reloj';
import { alcanzaParaBuscar, escaparLike, type ResultadosDeBusqueda } from '../../../lib/texto';
import { condicionCliente } from '../../clientes/api/busqueda';
import { normalizarTelefono } from '../../clientes/telefono';
import { insertarPago } from '../../pagos/api/pagosLocal';
import { calcularSaldo } from '../../pagos/saldo';
import { estaCerrada, estadoDeLaBase, estadoEfectivo, puedePasarA } from '../estado';
import type { Retiro } from '../retiro';
import type { OrdenVista, PagoVisto, QuienRegistra, RenglonVisto, ResultadoAccion } from '../types';
import { renglonesPorOrden } from './renglonesLocal';

export const MENSAJES_ACCION = {
  noEncontrada: 'No se encontró esa boleta en esta sucursal.',
  cerrada: 'Esta ropa ya fue entregada o anulada: no se puede cambiar.',
  avance: 'Esta ropa ya pasó por ese paso.',
  monto: 'Escribe cuánto paga el cliente, con números mayores que cero, por ejemplo 20 o 20,50.',
  montoMayor: 'El cobro no puede ser mayor que lo que falta pagar.',
  sinMetodo: 'Elige cómo paga: efectivo, QR o tarjeta.',
} as const;

// La orden con su cliente y su entrega. Los pagos se leen aparte: son varios por orden.
// Exportada desde SPEC-KRILINXI-041: el historial de boletas lee lo mismo con otros filtros.
export const SELECT_ORDENES = `
  SELECT o.id, o.numero_boleta, o.cliente_id, o.descripcion, o.estado, o.fecha_entrada, o.fecha_estimada_salida,
         o.precio_total, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
         e.id AS entrega_id, e.precio_final,
         e.tipo_retiro, e.retirado_por_nombre, e.retirado_por_carnet
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

/** Quién retiró, de la fila de la entrega; null si no hay entrega o el tipo guardado no se entiende. */
function aRetiro(fila: Fila): Retiro | null {
  if (typeof fila.entrega_id !== 'string' || !esTipoRetiro(fila.tipo_retiro)) return null;
  return {
    tipo: fila.tipo_retiro,
    nombre: texto(fila.retirado_por_nombre),
    carnet: texto(fila.retirado_por_carnet),
  };
}

/** Arma la vista de una orden. Una fila rota (sin estado que se conozca) no se muestra. */
function aOrden(fila: Fila, pagos: PagoVisto[], renglones: RenglonVisto[]): OrdenVista | null {
  const { id, numero_boleta } = fila;
  const estado = estadoDeLaBase(fila.estado);
  if (typeof id !== 'string' || typeof numero_boleta !== 'string' || estado === null) return null;

  const precioTotal = monto(fila.precio_total);
  const tieneEntrega = typeof fila.entrega_id === 'string';
  const precioFinal = tieneEntrega ? monto(fila.precio_final) : null;
  const montos = pagos.map((p) => p.monto);

  return {
    id,
    numeroBoleta: numero_boleta,
    descripcion: texto(fila.descripcion) ?? '',
    estado: estadoEfectivo(estado, tieneEntrega),
    clienteId: texto(fila.cliente_id),
    clienteNombre: texto(fila.cliente_nombre) ?? 'Cliente sin nombre',
    clienteTelefono: texto(fila.cliente_telefono) ?? '',
    fechaEntrada: texto(fila.fecha_entrada),
    fechaEstimada: texto(fila.fecha_estimada_salida),
    precioTotal,
    precioFinal,
    retiro: aRetiro(fila),
    pagado: sumar(...montos),
    saldo: calcularSaldo({ precioTotal, precioFinal, pagos: montos }),
    pagos,
    renglones,
  };
}

/** De las filas de `SELECT_ORDENES` a órdenes con su estado efectivo, sus pagos, sus renglones y su saldo. */
export async function armar(base: BaseLocal, filas: Fila[]): Promise<OrdenVista[]> {
  const ids = filas.map((f) => f.id).filter((id): id is string => typeof id === 'string');
  const [pagos, renglones] = await Promise.all([pagosPorOrden(base, ids), renglonesPorOrden(base, ids)]);
  return filas.flatMap((fila) => {
    const id = typeof fila.id === 'string' ? fila.id : '';
    const orden = aOrden(fila, pagos.get(id) ?? [], renglones.get(id) ?? []);
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

/**
 * La ropa de un cliente en la sucursal — SPEC-KRILINXI-033, para su ficha en el Mostrador. Toda,
 * también la entregada y la anulada: es su historia en este local. Primero la que sigue en el
 * local y, dentro de cada grupo, la más nueva arriba (la regla de qué está cerrado, de `estado.ts`).
 */
export async function ropaDelCliente(base: BaseLocal, sucursalId: string, clienteId: string): Promise<OrdenVista[]> {
  const filas = await base.consultar(`${SELECT_ORDENES} AND o.cliente_id = ? ORDER BY o.fecha_entrada DESC`, [
    sucursalId,
    clienteId,
  ]);
  const ordenes = await armar(base, filas);
  return ordenes.sort((a, b) => Number(estaCerrada(a.estado)) - Number(estaCerrada(b.estado)));
}

/** Cuántas boletas muestra el buscador (SPEC-KRILINXI-032), igual que con los clientes. */
const MAXIMO_RESULTADOS = 6;

/**
 * La ropa de la sucursal que coincide con lo escrito, mientras se escribe — SPEC-KRILINXI-032.
 *
 * Coincide si el número de boleta contiene lo escrito (las boletas tienen ceros adelante:
 * "1234" encuentra "001234"), o si su cliente coincide con la misma regla que la búsqueda de
 * clientes (`clientes/api/busqueda.ts`: nombre sin tildes, parte del teléfono, carnet).
 *
 * Primero la boleta exacta, después las que empiezan así, después el resto, cada grupo de la más
 * nueva a la más vieja. Dentro de lo que se muestra, la ropa que sigue en el local va antes que la
 * entregada o anulada: eso se ordena después de armar, con `estaCerrada`, para que la regla de qué
 * está cerrado siga en un solo lugar (`estado.ts`).
 */
export async function buscarRopaVivo(
  base: BaseLocal,
  sucursalId: string,
  texto: string,
): Promise<ResultadosDeBusqueda<OrdenVista>> {
  const escrito = texto.trim();
  const cliente = alcanzaParaBuscar(texto)
    ? condicionCliente(texto, { nombre: 'c.nombre', telefono: 'c.telefono', carnet: 'c.carnet' })
    : null;
  if (!cliente) return { resultados: [], hayMas: false };

  const boleta = escaparLike(escrito);
  const filas = await base.consultar(
    `${SELECT_ORDENES}
       AND (o.numero_boleta LIKE ? ESCAPE '\\' OR (${cliente.donde}))
     ORDER BY CASE
                WHEN o.numero_boleta = ? THEN 0
                WHEN o.numero_boleta LIKE ? ESCAPE '\\' THEN 1
                ELSE 2 END,
              o.fecha_entrada DESC
     LIMIT ?`,
    [sucursalId, `%${boleta}%`, ...cliente.parametros, escrito, `${boleta}%`, MAXIMO_RESULTADOS + 1],
  );
  const ordenes = await armar(base, filas);
  const visibles = ordenes.slice(0, MAXIMO_RESULTADOS);
  // La boleta exacta, arriba siempre (quien escribe el número entero busca ESA); después, la ropa
  // en el local antes que la cerrada. `sort` es estable: dentro de cada grupo queda el orden del SQL.
  const grupo = (o: OrdenVista) => (o.numeroBoleta === escrito ? 0 : estaCerrada(o.estado) ? 2 : 1);
  visibles.sort((a, b) => grupo(a) - grupo(b));
  return { resultados: visibles, hayMas: ordenes.length > MAXIMO_RESULTADOS };
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
    fechaPago: horaOficial(),
  });
  return { tipo: 'hecho' };
}
