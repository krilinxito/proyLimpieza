/**
 * Guardar la corrección de una boleta — SPEC-KRILINXI-071.
 *
 * Directo a la API con `enviar()`, no por la cola, como lo demás que escribe el admin (SPEC-KRILINXI-017): no tiene esa
 * boleta en la tablet (es de cualquier sucursal), y el servidor tiene que poder decir que no al momento (un número que ya
 * está en la sucursal elegida, una sucursal cerrada, un total por debajo de lo cobrado). Los mensajes de rechazo llegan
 * escritos para la pantalla, en tuteo y diciendo qué hacer: se muestran tal cual.
 */
import { api, enviar } from '../../../lib/api';
import type { CuerpoCorreccion } from '../correccion';

export type ResultadoCorreccion =
  | { tipo: 'guardado' }
  | { tipo: 'rechazado'; mensaje: string }
  | { tipo: 'sin-conexion' };

export async function corregirBoleta(ordenId: string, cuerpo: CuerpoCorreccion): Promise<ResultadoCorreccion> {
  const envio = await enviar(() => api.patch(`/ordenes/${ordenId}`, cuerpo));
  if (envio.tipo === 'hecho') return { tipo: 'guardado' };
  if (envio.tipo === 'sin-conexion') return envio;
  return { tipo: 'rechazado', mensaje: envio.mensaje };
}
