/**
 * La hora oficial de la tablet — SPEC-KRILINXI-012.
 *
 * `fecha_entrada`, `fecha_pago` y `fecha_entrega` las pone la tablet y son las que quedan en
 * los registros (CLAUDE.md §13). Si su reloj está mal (una tablet que se quedó sin batería y
 * volvió en 2001, o que alguien adelantó a mano), quedan mal: una orden "del futuro" que el
 * servidor rechaza (SPEC-ALE186-014), o un cobro que cae en el día equivocado del reporte.
 *
 * Cada vez que hay conexión, el servidor dice qué hora es (`ahora` en login y renovar,
 * SPEC-ALE186-015). Aquí se guarda la diferencia con el reloj de la tablet, y `horaOficial()`
 * la suma. Así la corrección vale también sin internet: no hace falta preguntarle a nadie.
 *
 * El desfase es de la tablet, no de quien la usa: vive en su propia clave, aparte de la sesión,
 * y salir no lo borra.
 */

const CLAVE = 'lavanderia.desfaseReloj';

/** Cuándo salió y cuándo volvió el pedido que trajo `ahora`, en milisegundos de la tablet. */
export type Viaje = { enviado: number; recibido: number };

function leerDesfase(): number {
  try {
    const guardado = localStorage.getItem(CLAVE);
    const desfase = guardado === null ? 0 : Number(guardado);
    return Number.isFinite(desfase) ? desfase : 0;
  } catch {
    return 0;
  }
}

/**
 * Anota la hora que dijo el servidor. Lo que no sea una fecha válida se ignora y queda el
 * desfase de antes: mejor una corrección vieja que ninguna, o que una inventada.
 *
 * El servidor leyó su reloj en algún momento entre que el pedido salió y que volvió. Lo más
 * probable es la mitad del viaje: comparar contra ese punto deja el error en medio viaje como
 * mucho, en vez del viaje entero.
 */
export function registrarHoraDelServidor(ahora: unknown, { enviado, recibido }: Viaje): void {
  if (typeof ahora !== 'string') return;
  const delServidor = Date.parse(ahora);
  if (Number.isNaN(delServidor)) return;
  const desfase = Math.round(delServidor - (enviado + recibido) / 2);
  try {
    localStorage.setItem(CLAVE, String(desfase));
  } catch {
    // Sin almacenamiento (modo privado, lleno) no hay corrección: queda el reloj de la tablet.
  }
}

/**
 * Hace el pedido, lo cronometra y, si la respuesta trae `ahora`, lo anota. Devuelve la
 * respuesta tal cual. Es para login y renovar, las dos que traen la hora del servidor.
 */
export async function conHoraDelServidor(pedir: () => Promise<unknown>): Promise<unknown> {
  const enviado = Date.now();
  const respuesta = await pedir();
  const recibido = Date.now();
  if (typeof respuesta === 'object' && respuesta !== null && 'ahora' in respuesta) {
    registrarHoraDelServidor(respuesta.ahora, { enviado, recibido });
  }
  return respuesta;
}

/** Lo que el servidor va por delante del reloj de la tablet, en milisegundos (negativo si va por detrás). */
export function desfaseDelReloj(): number {
  return leerDesfase();
}

/**
 * La hora de ahora según el servidor, en ISO 8601 UTC ("2026-10-16T14:05:00.000Z"), el formato
 * que exige el backend. Sin desfase medido, es la hora de la tablet.
 */
export function horaOficial(): string {
  return new Date(Date.now() + leerDesfase()).toISOString();
}
