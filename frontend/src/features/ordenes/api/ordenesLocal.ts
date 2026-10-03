/**
 * Registrar ropa en la base local: la orden y, si lo hay, su adelanto — SPEC-KRILINXI-006.
 *
 * Mismo patrón que `features/clientes/api/clientesLocal.ts` (SPEC-KRILINXI-005): la base
 * llega como argumento, todo es SQL sobre SQLite y nada habla con la API. Lo escrito queda
 * en la cola: la orden sube como `POST /api/ordenes` y el adelanto como `POST /api/pagos`,
 * en ese orden, porque la cola respeta el orden en que se escribió.
 *
 * Las validaciones repiten las del backend (SPEC-ALE186-004 y 005), con sus mismos textos.
 * Aquí son cortesía: el empleado se entera al momento, con o sin internet. La garantía
 * sigue siendo del servidor (CLAUDE.md §6).
 */
import type { BaseLocal } from '../../../lib/powersync';
import { aDecimal, parsearMonto, type Centavos } from '../../../lib/money';
import { insertarPago } from '../../pagos/api/pagosLocal';
import { calcularSaldo } from '../../pagos/saldo';
import type { DatosRopa, ErroresRopa, QuienRegistra, ResultadoRegistro } from '../types';

const LARGO_MAXIMO_BOLETA = 30; // VARCHAR(30) en el schema
const MONTO_MAXIMO: Centavos = 9_999_999_999; // NUMERIC(10,2)

export const MENSAJES = {
  sinCliente: 'Falta elegir el cliente que deja la ropa.',
  sinBoleta: 'Escribí el número de la boleta.',
  boletaLarga: 'Ese número de boleta es demasiado largo. Revisá el papel y volvé a escribirlo.',
  boletaOcupada: 'Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo.',
  sinDescripcion: 'Escribí qué ropa deja el cliente.',
  precio: 'Escribí el precio con números, por ejemplo 25 o 25,50.',
  fecha: 'La fecha de entrega estimada no es válida.',
  adelanto: 'Escribí cuánto deja de adelanto, con números mayores que cero, por ejemplo 20 o 20,50.',
  adelantoMayor: 'El adelanto no puede ser mayor que el precio.',
  sinMetodo: 'Elegí cómo paga el adelanto: efectivo, QR, tarjeta o transferencia.',
} as const;

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Una fecha de calendario que existe: rechaza "2026-02-30". */
function esFechaValida(texto: string): boolean {
  const partes = FECHA.exec(texto);
  if (!partes) return false;
  const [anio, mes, dia] = partes.slice(1).map(Number) as [number, number, number];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

/** Un monto escrito, o null si no es un monto. */
function leerMonto(texto: string): Centavos | null {
  try {
    return parsearMonto(texto);
  } catch {
    return null;
  }
}

/** Si ya hay una orden de esa sucursal con esa boleta. La boleta es única por sucursal (§6). */
async function boletaOcupada(base: BaseLocal, sucursalId: string, numeroBoleta: string): Promise<boolean> {
  const filas = await base.consultar('SELECT 1 FROM ordenes WHERE sucursal_id = ? AND numero_boleta = ? LIMIT 1', [
    sucursalId,
    numeroBoleta,
  ]);
  return filas.length > 0;
}

/**
 * Valida todo y, solo si todo está bien, escribe: primero la orden, después el adelanto.
 * Si el adelanto está mal no se guarda nada, ni siquiera la orden.
 */
export async function registrarRopa(base: BaseLocal, quien: QuienRegistra, datos: DatosRopa): Promise<ResultadoRegistro> {
  const numeroBoleta = datos.numeroBoleta.trim();
  const descripcion = datos.descripcion.trim();
  const fechaEstimada = datos.fechaEstimada.trim();
  const hayAdelanto = datos.adelanto.trim() !== '';

  const errores: ErroresRopa = {};
  if (!datos.cliente) errores.cliente = MENSAJES.sinCliente;
  if (numeroBoleta === '') errores.numeroBoleta = MENSAJES.sinBoleta;
  else if (numeroBoleta.length > LARGO_MAXIMO_BOLETA) errores.numeroBoleta = MENSAJES.boletaLarga;
  if (descripcion === '') errores.descripcion = MENSAJES.sinDescripcion;

  const precio = leerMonto(datos.precio);
  if (precio === null || precio > MONTO_MAXIMO) errores.precio = MENSAJES.precio;

  if (fechaEstimada !== '' && !esFechaValida(fechaEstimada)) errores.fechaEstimada = MENSAJES.fecha;

  const adelanto = hayAdelanto ? leerMonto(datos.adelanto) : 0;
  if (hayAdelanto) {
    if (adelanto === null || adelanto <= 0) errores.adelanto = MENSAJES.adelanto;
    else if (precio !== null && adelanto > precio) errores.adelanto = MENSAJES.adelantoMayor;
    if (!datos.metodoAdelanto) errores.metodoAdelanto = MENSAJES.sinMetodo;
  }

  // La boleta repetida se consulta solo si el número en sí está bien: es la única
  // validación que necesita la base.
  if (!errores.numeroBoleta && (await boletaOcupada(base, quien.sucursalId, numeroBoleta))) {
    errores.numeroBoleta = MENSAJES.boletaOcupada;
  }

  // Los `=== null` repiten lo que ya dicen los errores, pero así TypeScript sabe que de aquí
  // en adelante cliente, precio y adelanto existen.
  if (Object.keys(errores).length > 0 || !datos.cliente || precio === null || adelanto === null) {
    return { tipo: 'invalida', errores };
  }

  const ordenId = crypto.randomUUID();
  // ISO 8601 con zona ("2026-10-03T14:05:00.000Z"): el formato que exige el backend.
  const ahora = new Date().toISOString();

  await base.ejecutar(
    `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id, descripcion,
                          fecha_entrada, fecha_estimada_salida, precio_total, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECIBIDO')`,
    [
      ordenId,
      numeroBoleta,
      datos.cliente.id,
      quien.sucursalId,
      quien.usuarioId,
      descripcion,
      ahora,
      fechaEstimada === '' ? null : fechaEstimada,
      aDecimal(precio),
    ],
  );

  if (hayAdelanto && datos.metodoAdelanto) {
    await insertarPago(base, {
      ordenId,
      sucursalId: quien.sucursalId,
      usuarioId: quien.usuarioId,
      monto: adelanto,
      tipo: 'ADELANTO',
      metodo: datos.metodoAdelanto,
      fechaPago: ahora,
    });
  }

  return {
    tipo: 'registrada',
    ropa: {
      ordenId,
      numeroBoleta,
      cliente: datos.cliente,
      descripcion,
      precioTotal: precio,
      adelanto,
      saldo: calcularSaldo({ precioTotal: precio, precioFinal: null, pagos: adelanto > 0 ? [adelanto] : [] }),
      fechaEstimada: fechaEstimada === '' ? null : fechaEstimada,
    },
  };
}
