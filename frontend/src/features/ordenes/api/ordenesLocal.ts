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
import type { BaseLocal, Sentencia } from '../../../lib/powersync';
import { aDecimal, parsearMonto, type Centavos } from '../../../lib/money';
import { horaOficial } from '../../../lib/reloj';
import { clienteNuevo, sentenciaAltaCliente, validarCliente } from '../../clientes/api/clientesLocal';
import type { Cliente, ClienteElegido } from '../../clientes/types';
import { sentenciaPago } from '../../pagos/api/pagosLocal';
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

/**
 * Si ya hay una orden de esa sucursal con esa boleta. La boleta es única por sucursal (§6).
 * `excluirOrdenId` deja afuera a la orden que se está corrigiendo (SPEC-KRILINXI-013): su
 * propia fila puede seguir en la base con la boleta que el servidor rechazó.
 */
async function boletaOcupada(
  base: BaseLocal,
  sucursalId: string,
  numeroBoleta: string,
  excluirOrdenId: string | null,
): Promise<boolean> {
  const filas = await base.consultar(
    'SELECT 1 FROM ordenes WHERE sucursal_id = ? AND numero_boleta = ? AND id IS NOT ? LIMIT 1',
    [sucursalId, numeroBoleta, excluirOrdenId],
  );
  return filas.length > 0;
}

/** Lo que el empleado escribe de la ropa, sin el cliente ni el adelanto. */
export type DatosDeLaRopa = Pick<DatosRopa, 'numeroBoleta' | 'descripcion' | 'precio' | 'fechaEstimada'>;

export type RopaValidada = {
  errores: ErroresRopa;
  /** Los valores ya limpios. `precio` es null si no es un monto (y entonces hay error). */
  valores: { numeroBoleta: string; descripcion: string; precio: Centavos | null; fechaEstimada: string | null };
};

/**
 * Las validaciones de la ropa, en un solo lugar: las usan registrar ropa y la corrección de
 * lo que el servidor rechazó (SPEC-KRILINXI-013), así el empleado lee el mismo mensaje en
 * las dos pantallas.
 */
export async function validarRopa(
  base: BaseLocal,
  sucursalId: string,
  datos: DatosDeLaRopa,
  excluirOrdenId: string | null = null,
): Promise<RopaValidada> {
  const numeroBoleta = datos.numeroBoleta.trim();
  const descripcion = datos.descripcion.trim();
  const fechaEstimada = datos.fechaEstimada.trim();

  const errores: ErroresRopa = {};
  if (numeroBoleta === '') errores.numeroBoleta = MENSAJES.sinBoleta;
  else if (numeroBoleta.length > LARGO_MAXIMO_BOLETA) errores.numeroBoleta = MENSAJES.boletaLarga;
  if (descripcion === '') errores.descripcion = MENSAJES.sinDescripcion;

  const precio = leerMonto(datos.precio);
  if (precio === null || precio > MONTO_MAXIMO) errores.precio = MENSAJES.precio;

  if (fechaEstimada !== '' && !esFechaValida(fechaEstimada)) errores.fechaEstimada = MENSAJES.fecha;

  // La boleta repetida se consulta solo si el número en sí está bien: es la única
  // validación que necesita la base.
  if (!errores.numeroBoleta && (await boletaOcupada(base, sucursalId, numeroBoleta, excluirOrdenId))) {
    errores.numeroBoleta = MENSAJES.boletaOcupada;
  }

  return { errores, valores: { numeroBoleta, descripcion, precio, fechaEstimada: fechaEstimada === '' ? null : fechaEstimada } };
}

type ClienteValidadoDeLaRopa =
  | { tipo: 'listo'; cliente: Cliente; alta: Sentencia | null }
  | { tipo: 'invalido'; errores: ErroresRopa }
  | { tipo: 'telefono-ocupado'; cliente: Cliente };

/**
 * Quién deja la ropa, listo para guardar — SPEC-KRILINXI-034. Uno que ya existe pasa tal cual; uno
 * nuevo se valida con las mismas reglas que el alta de /clientes (`validarCliente`), y si su
 * teléfono ya es de otro, se avisa en vez de guardarlo dos veces.
 */
async function prepararCliente(base: BaseLocal, elegido: ClienteElegido | null): Promise<ClienteValidadoDeLaRopa> {
  if (!elegido) return { tipo: 'invalido', errores: { cliente: MENSAJES.sinCliente } };
  if (elegido.tipo === 'existente') return { tipo: 'listo', cliente: elegido.cliente, alta: null };

  const { errores, nombre, telefono, ocupadoPor } = await validarCliente(base, elegido.datos);
  if (errores.nombre || errores.telefono) {
    return { tipo: 'invalido', errores: { clienteNombre: errores.nombre, clienteTelefono: errores.telefono } };
  }
  if (ocupadoPor) return { tipo: 'telefono-ocupado', cliente: ocupadoPor };
  const cliente = clienteNuevo({ nombre, telefono, carnet: elegido.datos.carnet });
  return { tipo: 'listo', cliente, alta: sentenciaAltaCliente(cliente) };
}

/** Saca las claves sin mensaje: `{ clienteNombre: undefined }` no es un error. */
function soloErrores(errores: ErroresRopa): ErroresRopa {
  return Object.fromEntries(Object.entries(errores).filter(([, mensaje]) => mensaje !== undefined));
}

/**
 * Valida todo y, solo si todo está bien, escribe. Desde SPEC-KRILINXI-034, en una sola transacción
 * (`ejecutarJuntas`): el alta del cliente si es nuevo, la orden y el adelanto. O se guarda todo o
 * nada: si el adelanto está mal no se guarda ni la orden, y nunca queda un cliente nuevo sin la ropa
 * que vino a dejar. La cola sube en ese mismo orden, así la orden llega después de su cliente.
 */
export async function registrarRopa(base: BaseLocal, quien: QuienRegistra, datos: DatosRopa): Promise<ResultadoRegistro> {
  const hayAdelanto = datos.adelanto.trim() !== '';
  const [validada, elCliente] = await Promise.all([
    validarRopa(base, quien.sucursalId, datos),
    prepararCliente(base, datos.cliente),
  ]);
  if (elCliente.tipo === 'telefono-ocupado') return elCliente;
  const { numeroBoleta, descripcion, precio, fechaEstimada } = validada.valores;

  const errores: ErroresRopa = { ...validada.errores, ...(elCliente.tipo === 'invalido' ? elCliente.errores : {}) };

  const adelanto = hayAdelanto ? leerMonto(datos.adelanto) : 0;
  if (hayAdelanto) {
    if (adelanto === null || adelanto <= 0) errores.adelanto = MENSAJES.adelanto;
    else if (precio !== null && adelanto > precio) errores.adelanto = MENSAJES.adelantoMayor;
    if (!datos.metodoAdelanto) errores.metodoAdelanto = MENSAJES.sinMetodo;
  }

  // Los `=== null` repiten lo que ya dicen los errores, pero así TypeScript sabe que de aquí
  // en adelante cliente, precio y adelanto existen.
  const limpios = soloErrores(errores);
  if (Object.keys(limpios).length > 0 || elCliente.tipo !== 'listo' || precio === null || adelanto === null) {
    return { tipo: 'invalida', errores: limpios };
  }
  const { cliente, alta } = elCliente;

  const ordenId = crypto.randomUUID();
  // La hora del servidor aunque el reloj de la tablet esté mal, en el formato ISO 8601 con zona
  // que exige el backend (SPEC-KRILINXI-012).
  const ahora = horaOficial();

  const sentencias: Sentencia[] = [
    ...(alta ? [alta] : []),
    {
      sql: `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id, descripcion,
                                 fecha_entrada, fecha_estimada_salida, precio_total, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECIBIDO')`,
      parametros: [
        ordenId,
        numeroBoleta,
        cliente.id,
        quien.sucursalId,
        quien.usuarioId,
        descripcion,
        ahora,
        fechaEstimada,
        aDecimal(precio),
      ],
    },
  ];
  if (hayAdelanto && datos.metodoAdelanto) {
    sentencias.push(
      sentenciaPago(crypto.randomUUID(), {
        ordenId,
        sucursalId: quien.sucursalId,
        usuarioId: quien.usuarioId,
        monto: adelanto,
        tipo: 'ADELANTO',
        metodo: datos.metodoAdelanto,
        fechaPago: ahora,
      }),
    );
  }
  await base.ejecutarJuntas(sentencias);

  return {
    tipo: 'registrada',
    ropa: {
      ordenId,
      numeroBoleta,
      cliente,
      descripcion,
      precioTotal: precio,
      adelanto,
      saldo: calcularSaldo({ precioTotal: precio, precioFinal: null, pagos: adelanto > 0 ? [adelanto] : [] }),
      fechaEstimada,
    },
  };
}
