/**
 * Corregir lo que el servidor rechazó y volver a mandarlo — SPEC-KRILINXI-013.
 *
 * El registro rechazado vive en `para_corregir` (lo copió la subida, SPEC-KRILINXI-007) con
 * lo que se intentó subir. Corregirlo es volver a escribirlo en la base local, con los datos
 * arreglados, para que la cola lo suba otra vez; todo sin internet, como el resto del
 * mostrador. Lo que se escribe y el borrado de `para_corregir` van en una sola transacción:
 * o queda corregido y fuera de la lista, o no cambió nada.
 *
 * Dos casos, según lo que se había rechazado:
 *
 *  - **Un alta (PUT)**. Nunca llegó a existir en el servidor. Se vuelve a escribir con
 *    `INSERT OR REPLACE` y **el mismo id**: así lo que dependía de ella (el adelanto de una
 *    orden, la orden de un cliente nuevo) le sigue apuntando y se puede reenviar después
 *    tal cual. El `OR REPLACE` es porque la fila rechazada puede seguir en la tablet hasta
 *    la próxima sincronización, que es cuando PowerSync la revierte; PowerSync lo anota
 *    igual como un alta completa, y el servidor la recibe como la primera vez.
 *  - **Una edición (PATCH)**. El registro sí existe en el servidor. Se vuelve a escribir con
 *    `UPDATE`, solo con lo que difiere de lo que hay en la tablet. Un cambio de estado no se
 *    corrige aquí: si el servidor lo rechazó es que la ropa ya está en otro estado, y eso se
 *    mira y se rehace desde "Ropa en el local".
 *
 * Qué campos se corrigen de cada tabla está en `../correccion.ts`. Las validaciones son las mismas que en la pantalla de origen, con sus mismos textos
 * (`validarRopa`, los mensajes de clientes, cobros y entregas).
 */
import type { BaseLocal, Fila, Sentencia } from '../../../lib/powersync';
import { aDecimal, parsearMonto, type Centavos } from '../../../lib/money';
import { esMetodoPago, esTipoRetiro } from '../../../lib/dominio';
import { buscarPorTelefono, FALTA_NOMBRE, FALTA_TELEFONO } from '../../clientes/api/clientesLocal';
import { normalizarTelefono } from '../../clientes/telefono';
import { MENSAJES_ENTREGA } from '../../entregas/api/entregasLocal';
import { MENSAJES_ACCION } from '../../ordenes/api/ropaLocal';
import { validarRopa } from '../../ordenes/api/ordenesLocal';
import { CAMPOS, MENSAJES_CORRECCION, paraFormulario, prepararCorreccion, type ResultadoCorreccion } from '../correccion';
import type { RegistroParaCorregir } from '../types';

// Los nombres de tabla y columna no pueden ir como `?`: van en el texto del SQL. Por eso solo
// se aceptan las tablas de `CAMPOS` y columnas con forma de columna (CLAUDE.md §5: nunca
// concatenar un valor; esto no es un valor, y aun así se comprueba).
const COLUMNA = /^[a-z_]+$/;

function leerMonto(texto: string): Centavos | null {
  try {
    return parsearMonto(texto);
  } catch {
    return null;
  }
}

/** Lo que se escribe en la base, o los errores por columna. */
type Validacion = { errores: Record<string, string>; datos: Record<string, unknown> };

async function validarOrden(
  base: BaseLocal,
  sucursalId: string,
  ordenId: string,
  v: Record<string, string>,
): Promise<Validacion> {
  const { errores, valores } = await validarRopa(
    base,
    sucursalId,
    {
      numeroBoleta: v.numero_boleta ?? '',
      descripcion: v.descripcion ?? '',
      precio: v.precio_total ?? '',
      fechaEstimada: v.fecha_estimada_salida ?? '',
    },
    ordenId,
  );
  const porColumna: Record<string, string> = {};
  if (errores.numeroBoleta) porColumna.numero_boleta = errores.numeroBoleta;
  if (errores.descripcion) porColumna.descripcion = errores.descripcion;
  if (errores.precio) porColumna.precio_total = errores.precio;
  if (errores.fechaEstimada) porColumna.fecha_estimada_salida = errores.fechaEstimada;
  return {
    errores: porColumna,
    datos: {
      numero_boleta: valores.numeroBoleta,
      descripcion: valores.descripcion,
      precio_total: valores.precio === null ? null : aDecimal(valores.precio),
      fecha_estimada_salida: valores.fechaEstimada,
    },
  };
}

async function validarCliente(base: BaseLocal, clienteId: string, v: Record<string, string>): Promise<Validacion> {
  const nombre = (v.nombre ?? '').trim();
  const telefono = normalizarTelefono(v.telefono ?? '');
  const carnet = (v.carnet ?? '').trim();
  const errores: Record<string, string> = {};
  if (nombre === '') errores.nombre = FALTA_NOMBRE;
  if (telefono === '') errores.telefono = FALTA_TELEFONO;
  else {
    // El teléfono es único en todo el sistema (CLAUDE.md §3). Su propia fila no cuenta.
    const duenio = await buscarPorTelefono(base, telefono);
    if (duenio && duenio.id !== clienteId) errores.telefono = MENSAJES_CORRECCION.telefonoOcupado(duenio.nombre);
  }
  return { errores, datos: { nombre, telefono, carnet: carnet === '' ? null : carnet } };
}

function validarPago(v: Record<string, string>): Validacion {
  const monto = leerMonto(v.monto ?? '');
  const metodo = v.metodo ?? '';
  const errores: Record<string, string> = {};
  if (monto === null || monto <= 0) errores.monto = MENSAJES_ACCION.monto;
  if (!esMetodoPago(metodo)) errores.metodo = MENSAJES_ACCION.sinMetodo;
  return { errores, datos: { monto: monto === null || monto <= 0 ? null : aDecimal(monto), metodo } };
}

function validarEntrega(v: Record<string, string>): Validacion {
  const tipo = v.tipo_retiro ?? '';
  const nombre = (v.retirado_por_nombre ?? '').trim();
  const carnet = (v.retirado_por_carnet ?? '').trim();
  const precioFinal = leerMonto(v.precio_final ?? '');
  const errores: Record<string, string> = {};
  if (!esTipoRetiro(tipo)) errores.tipo_retiro = MENSAJES_ENTREGA.sinBoletaElegida;
  if (tipo === 'SIN_BOLETA') {
    // Regla del negocio (CLAUDE.md §3): sin boleta, nombre Y carnet de quien retira.
    if (nombre === '') errores.retirado_por_nombre = MENSAJES_ENTREGA.sinNombre;
    if (carnet === '') errores.retirado_por_carnet = MENSAJES_ENTREGA.sinCarnet;
  }
  if (precioFinal === null) errores.precio_final = MENSAJES_ENTREGA.precioFinal;
  const conBoleta = tipo === 'CON_BOLETA';
  return {
    errores,
    datos: {
      tipo_retiro: tipo,
      // Con boleta no se pide a nadie: se guarda vacío, igual que al entregar.
      retirado_por_nombre: conBoleta ? null : nombre,
      retirado_por_carnet: conBoleta ? null : carnet,
      precio_final: precioFinal === null ? null : aDecimal(precioFinal),
    },
  };
}

function validar(
  base: BaseLocal,
  sucursalId: string,
  registro: RegistroParaCorregir,
  valores: Record<string, string>,
): Promise<Validacion> | Validacion {
  switch (registro.tabla) {
    case 'ordenes':
      return validarOrden(base, sucursalId, registro.registroId, valores);
    case 'clientes':
      return validarCliente(base, registro.registroId, valores);
    case 'pagos':
      return validarPago(valores);
    default:
      return validarEntrega(valores);
  }
}

const borrarDeLaLista = (id: string): Sentencia => ({ sql: 'DELETE FROM para_corregir WHERE id = ?', parametros: [id] });

/** La misma alta, con los datos corregidos encima de los que se habían enviado. */
function reescribirAlta(registro: RegistroParaCorregir, corregidos: Record<string, unknown>): Sentencia {
  const fila = { ...registro.datos, ...corregidos };
  const columnas = Object.keys(fila).filter((c) => COLUMNA.test(c) && c !== 'id');
  return {
    sql: `INSERT OR REPLACE INTO ${registro.tabla} (id, ${columnas.join(', ')}) VALUES (?, ${columnas.map(() => '?').join(', ')})`,
    parametros: [registro.registroId, ...columnas.map((c) => fila[c])],
  };
}

/**
 * Valida la corrección y, si está bien, la escribe y saca el registro de la lista, en una
 * sola transacción. `valores` son los textos del formulario, por columna.
 */
export async function guardarCorreccion(
  base: BaseLocal,
  sucursalId: string,
  registro: RegistroParaCorregir,
  valores: Record<string, string>,
): Promise<ResultadoCorreccion> {
  const preparada = prepararCorreccion(registro);
  if (preparada.tipo === 'sin-formulario') return { tipo: 'no-se-puede', mensaje: preparada.mensaje };
  const claves = preparada.campos.map((c) => c.clave);
  const esAlta = registro.operacion === 'PUT';

  // En una edición se valida el registro entero: lo que no se tocó sale de la tablet.
  let actual: Fila | undefined;
  if (!esAlta) {
    [actual] = await base.consultar(`SELECT * FROM ${registro.tabla} WHERE id = ?`, [registro.registroId]);
    if (!actual) return { tipo: 'no-se-puede', mensaje: MENSAJES_CORRECCION.yaNoEsta };
    const sinCambios = claves.every((c) => (valores[c] ?? '') === preparada.valores[c]);
    if (sinCambios) return { tipo: 'invalida', errores: { general: MENSAJES_CORRECCION.sinCambios } };
  }
  const completos = esAlta ? valores : { ...completarDesde(actual ?? {}), ...valores };

  const { errores, datos } = await validar(base, sucursalId, registro, completos);
  if (Object.keys(errores).length > 0) return { tipo: 'invalida', errores };

  // Solo las columnas del formulario: el resto del alta (cliente, sucursal, fechas) va tal cual.
  const corregidos = Object.fromEntries(claves.map((c) => [c, datos[c]]));

  if (esAlta) {
    await base.ejecutarJuntas([reescribirAlta(registro, corregidos), borrarDeLaLista(registro.id)]);
    return { tipo: 'guardada' };
  }

  // Una edición manda solo lo que difiere de la tablet. Si ya no difiere nada (la tablet ya
  // tiene esos valores), no hay nada que subir: alcanza con sacarlo de la lista.
  const cambian = Object.entries(corregidos).filter(([c, valor]) => COLUMNA.test(c) && (actual?.[c] ?? null) !== valor);
  const sentencias: Sentencia[] = [];
  if (cambian.length > 0) {
    sentencias.push({
      sql: `UPDATE ${registro.tabla} SET ${cambian.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`,
      parametros: [...cambian.map(([, valor]) => valor), registro.registroId],
    });
  }
  sentencias.push(borrarDeLaLista(registro.id));
  await base.ejecutarJuntas(sentencias);
  return { tipo: 'guardada' };
}

/** La fila de la tablet como textos del formulario, para validar una edición completa. */
function completarDesde(fila: Fila): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fila).map(([clave, valor]) => {
      const campo = Object.values(CAMPOS)
        .flat()
        .find((c) => c.clave === clave);
      return [clave, paraFormulario(campo?.tipo ?? 'texto', valor)];
    }),
  );
}

/** Saca el registro de la lista sin mandar nada. Lo que tenía no se va a guardar nunca. */
export async function descartarRegistro(base: BaseLocal, id: string): Promise<void> {
  await base.ejecutar('DELETE FROM para_corregir WHERE id = ?', [id]);
}
