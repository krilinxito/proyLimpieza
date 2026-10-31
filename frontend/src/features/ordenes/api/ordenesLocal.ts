/**
 * Registrar ropa en la base local: la orden, sus renglones y, si lo hay, su adelanto — SPEC-KRILINXI-006 y 068.
 *
 * Mismo patrón que `features/clientes/api/clientesLocal.ts` (SPEC-KRILINXI-005): la base
 * llega como argumento, todo es SQL sobre SQLite y nada habla con la API. Lo escrito queda
 * en la cola: la orden sube como `POST /api/ordenes`, cada renglón como `POST /api/orden-items`
 * y el adelanto como `POST /api/pagos`, en ese orden, porque la cola respeta el orden en que se escribió.
 *
 * Desde SPEC-KRILINXI-068 la boleta se escribe renglón por renglón (qué prenda, cuántas, a qué precio cada una), y el
 * total y la descripción salen de ahí: `precio_total` es la suma de los renglones y `descripcion`, su resumen ("2 Camisa,
 * 1 Edredón"). El servidor comprueba que los renglones no sumen más que el total.
 *
 * Las validaciones repiten las del backend (SPEC-ALE186-004 y 005), con sus mismos textos.
 * Aquí son cortesía: el empleado se entera al momento, con o sin internet. La garantía
 * sigue siendo del servidor (CLAUDE.md §6).
 */
import type { BaseLocal, Sentencia } from '../../../lib/powersync';
import { esNumeroDeBoleta } from '../../../lib/formatos';
import { aDecimal, parsearMonto, type Centavos } from '../../../lib/money';
import { horaOficial } from '../../../lib/reloj';
import { clienteNuevo, sentenciaAltaCliente, validarCliente } from '../../clientes/api/clientesLocal';
import type { Cliente, ClienteElegido } from '../../clientes/types';
import { sentenciaPago } from '../../pagos/api/pagosLocal';
import { calcularSaldo } from '../../pagos/saldo';
import { claveCampo, describirRenglones, totalDe, validarRenglon, type RenglonValido } from '../renglones';
import type { DatosRopa, ErroresRopa, QuienRegistra, ResultadoRegistro, RevisionDeRopa } from '../types';
import { sentenciaRenglon } from './renglonesLocal';

const LARGO_MAXIMO_BOLETA = 30; // VARCHAR(30) en el schema

export const MENSAJES = {
  sinCliente: 'Falta elegir el cliente que deja la ropa.',
  sinBoleta: 'Escribe el número de la boleta.',
  boletaLarga: 'Ese número de boleta es demasiado largo. Revisa el papel y vuelve a escribirlo.',
  // SPEC-KRILINXI-058: la misma regla que el servidor (`lib/formatos.ts`).
  boletaInvalida:
    'El número de boleta solo puede llevar letras, números y guion, y al menos un número. Revisa el papel y vuelve a escribirlo.',
  boletaOcupada: 'Ese número de boleta ya está usado en esta sucursal. Revisa el papel y vuelve a escribirlo.',
  sinDescripcion: 'Escribe qué ropa deja el cliente.',
  sinRenglones: 'Escribe al menos una prenda: qué es, cuántas y el precio de cada una.',
  fecha: 'La fecha de entrega estimada no es válida.',
  adelanto: 'Escribe cuánto deja de adelanto, con números mayores que cero, por ejemplo 20 o 20,50.',
  adelantoMayor: 'El adelanto no puede ser mayor que el total.',
  sinMetodo: 'Elige cómo paga el adelanto: efectivo, QR o tarjeta.',
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

/** Lo que el empleado escribe de la boleta en sí, sin el cliente, lo que deja ni el adelanto. */
export type DatosDeLaBoleta = Pick<DatosRopa, 'numeroBoleta' | 'fechaEstimada'>;

export type BoletaValidada = {
  errores: Pick<ErroresRopa, 'numeroBoleta' | 'fechaEstimada'>;
  /** Los valores ya limpios. */
  valores: { numeroBoleta: string; fechaEstimada: string | null };
};

/**
 * Las validaciones del número de boleta y la fecha, en un solo lugar: las usan registrar ropa y la corrección de lo que el
 * servidor rechazó (SPEC-KRILINXI-013), así el empleado lee el mismo mensaje en las dos pantallas. Lo que deja (los
 * renglones, SPEC-KRILINXI-068) se valida aparte, con `validarRenglon`.
 */
export async function validarBoleta(
  base: BaseLocal,
  sucursalId: string,
  datos: DatosDeLaBoleta,
  excluirOrdenId: string | null = null,
): Promise<BoletaValidada> {
  const numeroBoleta = datos.numeroBoleta.trim();
  const fechaEstimada = datos.fechaEstimada.trim();

  const errores: BoletaValidada['errores'] = {};
  if (numeroBoleta === '') errores.numeroBoleta = MENSAJES.sinBoleta;
  else if (numeroBoleta.length > LARGO_MAXIMO_BOLETA) errores.numeroBoleta = MENSAJES.boletaLarga;
  else if (!esNumeroDeBoleta(numeroBoleta)) errores.numeroBoleta = MENSAJES.boletaInvalida;

  if (fechaEstimada !== '' && !esFechaValida(fechaEstimada)) errores.fechaEstimada = MENSAJES.fecha;

  // La boleta repetida se consulta solo si el número en sí está bien: es la única
  // validación que necesita la base.
  if (!errores.numeroBoleta && (await boletaOcupada(base, sucursalId, numeroBoleta, excluirOrdenId))) {
    errores.numeroBoleta = MENSAJES.boletaOcupada;
  }

  return { errores, valores: { numeroBoleta, fechaEstimada: fechaEstimada === '' ? null : fechaEstimada } };
}

/**
 * Los renglones de la boleta, validados — SPEC-KRILINXI-068: el error de cada campo de cada renglón (por su clave, como
 * los muestra el formulario), los renglones limpios y el total. `total` es null si alguno está mal.
 */
function validarRenglones(datos: DatosRopa): { errores: ErroresRopa; validos: RenglonValido[]; total: Centavos | null } {
  const errores: ErroresRopa = {};
  if (datos.renglones.length === 0) errores.renglones = MENSAJES.sinRenglones;
  const validos: RenglonValido[] = [];
  for (const renglon of datos.renglones) {
    const { errores: suyos, valido } = validarRenglon(renglon);
    if (suyos.descripcion) errores[claveCampo(renglon.clave, 'descripcion')] = suyos.descripcion;
    if (suyos.cantidad) errores[claveCampo(renglon.clave, 'cantidad')] = suyos.cantidad;
    if (suyos.precioUnitario) errores[claveCampo(renglon.clave, 'precioUnitario')] = suyos.precioUnitario;
    if (valido) validos.push(valido);
  }
  if (validos.length === 0 || validos.length !== datos.renglones.length) return { errores, validos, total: null };
  const { total, error } = totalDe(validos);
  if (error) errores.renglones = error;
  return { errores, validos, total: error ? null : total };
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
  if (errores.nombre || errores.telefono || errores.carnet) {
    return {
      tipo: 'invalido',
      errores: { clienteNombre: errores.nombre, clienteTelefono: errores.telefono, clienteCarnet: errores.carnet },
    };
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
 * Todo lo que se puede decir de lo escrito sin escribir nada: los errores de cada campo, el cliente ya preparado, los
 * renglones validados y el adelanto leído. Es el trozo de `registrarRopa` que mira, separado para que `revisarRopa` (el
 * visto del formulario, SPEC-KRILINXI-058) y el guardado digan siempre lo mismo.
 */
async function revisar(base: BaseLocal, quien: QuienRegistra, datos: DatosRopa) {
  const hayAdelanto = datos.adelanto.trim() !== '';
  const [validada, elCliente] = await Promise.all([
    validarBoleta(base, quien.sucursalId, datos),
    prepararCliente(base, datos.cliente),
  ]);
  const renglones = validarRenglones(datos);
  const errores: ErroresRopa = {
    ...validada.errores,
    ...renglones.errores,
    ...(elCliente.tipo === 'invalido' ? elCliente.errores : {}),
  };

  const adelanto = hayAdelanto ? leerMonto(datos.adelanto) : 0;
  const { total } = renglones;
  if (hayAdelanto) {
    if (adelanto === null || adelanto <= 0) errores.adelanto = MENSAJES.adelanto;
    else if (total !== null && adelanto > total) errores.adelanto = MENSAJES.adelantoMayor;
    if (!datos.metodoAdelanto) errores.metodoAdelanto = MENSAJES.sinMetodo;
  }
  return { validada, renglones, elCliente, adelanto, hayAdelanto, errores: soloErrores(errores) };
}

/**
 * Cómo va lo escrito, sin guardar — SPEC-KRILINXI-058. Las mismas validaciones que `registrarRopa` (es la misma función por
 * dentro), con o sin internet: el formulario las usa para el visto de cada campo y de cada tarjeta.
 */
export async function revisarRopa(base: BaseLocal, quien: QuienRegistra, datos: DatosRopa): Promise<RevisionDeRopa> {
  const { errores, elCliente } = await revisar(base, quien, datos);
  return { errores, telefonoOcupado: elCliente.tipo === 'telefono-ocupado' };
}

/**
 * Valida todo y, solo si todo está bien, escribe. Desde SPEC-KRILINXI-034, en una sola transacción
 * (`ejecutarJuntas`): el alta del cliente si es nuevo, la orden, sus renglones (SPEC-KRILINXI-068) y el
 * adelanto. O se guarda todo o nada: si el adelanto está mal no se guarda ni la orden, y nunca queda un
 * cliente nuevo sin la ropa que vino a dejar. La cola sube en ese mismo orden, así la orden llega después
 * de su cliente y antes que sus renglones.
 */
export async function registrarRopa(base: BaseLocal, quien: QuienRegistra, datos: DatosRopa): Promise<ResultadoRegistro> {
  const { validada, renglones, elCliente, adelanto, hayAdelanto, errores: limpios } = await revisar(base, quien, datos);
  if (elCliente.tipo === 'telefono-ocupado') return elCliente;
  const { numeroBoleta, fechaEstimada } = validada.valores;
  const precio = renglones.total;

  // Los `=== null` repiten lo que ya dicen los errores, pero así TypeScript sabe que de aquí
  // en adelante cliente, precio y adelanto existen.
  if (Object.keys(limpios).length > 0 || elCliente.tipo !== 'listo' || precio === null || adelanto === null) {
    return { tipo: 'invalida', errores: limpios };
  }
  const { cliente, alta } = elCliente;
  // La descripción de la boleta es el resumen de sus renglones: así el buscador y el historial la siguen leyendo.
  const descripcion = describirRenglones(renglones.validos);

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
    // Después de la orden: la cola sube en este orden, y el servidor necesita la orden para aceptar sus renglones.
    ...renglones.validos.map((renglon, posicion) =>
      sentenciaRenglon({ renglon, ordenId, sucursalId: quien.sucursalId, momento: 'INGRESO', posicion }),
    ),
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
