/**
 * Dar de alta, editar, cerrar y reabrir sucursales — SPEC-KRILINXI-017.
 *
 * Directo a la API, no por la cola: son cambios del admin, que trabaja con conexión (CLAUDE.md
 * §8), y el servidor tiene que poder decir que no al momento (un nombre repetido, una sucursal
 * con ropa adentro). El id lo genera el dispositivo igual que en el mostrador: así un reintento
 * es idempotente (SPEC-ALE186-011).
 */
import { api, enviar, type Envio } from '../../../lib/api';
import type { DatosSucursal, ErroresSucursal, ResultadoSucursal, Sucursal } from '../types';

export const MENSAJES_SUCURSAL = {
  sinNombre: 'Escribí el nombre de la sucursal.',
  // El servidor dice "Quedan 3 órdenes…": "orden" es una palabra del sistema (CLAUDE.md §9).
  conRopa:
    'Todavía hay ropa en esta sucursal, y los clientes la retiran acá. Para cerrarla, primero hay que entregar o anular esa ropa.',
} as const;

/** Lo que manda el servidor, con los rechazos que hay que decir de otra manera. */
function resultadoDe(envio: Envio<unknown>): ResultadoSucursal {
  if (envio.tipo === 'hecho') return { tipo: 'guardado' };
  if (envio.tipo === 'sin-conexion') return envio;
  return { tipo: 'rechazado', mensaje: envio.codigo === 'SUCURSAL_CON_ROPA' ? MENSAJES_SUCURSAL.conRopa : envio.mensaje };
}

/** Los textos limpios; un opcional vacío es null, como lo guarda el servidor. */
function limpiar(datos: DatosSucursal) {
  const opcional = (valor: string) => (valor.trim() === '' ? null : valor.trim());
  return { nombre: datos.nombre.trim(), direccion: opcional(datos.direccion), telefono: opcional(datos.telefono) };
}

function validar(datos: DatosSucursal): ErroresSucursal {
  return datos.nombre.trim() === '' ? { nombre: MENSAJES_SUCURSAL.sinNombre } : {};
}

export async function crearSucursal(datos: DatosSucursal): Promise<ResultadoSucursal> {
  const errores = validar(datos);
  if (Object.keys(errores).length > 0) return { tipo: 'invalido', errores };
  return resultadoDe(await enviar(() => api.post('/sucursales', { id: crypto.randomUUID(), ...limpiar(datos) })));
}

/** Manda solo lo que cambió. Si no cambió nada, no manda nada. */
export async function editarSucursal(sucursal: Sucursal, datos: DatosSucursal): Promise<ResultadoSucursal> {
  const errores = validar(datos);
  if (Object.keys(errores).length > 0) return { tipo: 'invalido', errores };
  const nuevos = limpiar(datos);
  const cambios = Object.fromEntries(
    (['nombre', 'direccion', 'telefono'] as const).filter((c) => nuevos[c] !== sucursal[c]).map((c) => [c, nuevos[c]]),
  );
  if (Object.keys(cambios).length === 0) return { tipo: 'sin-cambios' };
  return resultadoDe(await enviar(() => api.patch(`/sucursales/${sucursal.id}`, cambios)));
}

/** Cerrar (false) o volver a abrir (true). El servidor rechaza cerrar una con ropa adentro. */
export async function cambiarApertura(sucursal: Sucursal, activa: boolean): Promise<ResultadoSucursal> {
  return resultadoDe(await enviar(() => api.patch(`/sucursales/${sucursal.id}`, { activa })));
}
