/**
 * "Hoy en la sucursal", para el Inicio de quien atiende — SPEC-KRILINXI-035.
 *
 * Todo de la base local y de la sucursal de trabajo: funciona sin internet (CLAUDE.md §6). No es
 * una estadística del admin (esas van a la API, §8): es lo que la persona del mostrador tiene que
 * atender hoy, con lo que ya está en su tablet.
 *
 * Se apoya en lo que ya existe: la ropa en el local es `listarAbiertas` (con el estado efectivo:
 * una entregada sin sincronizar no figura por entregar), y las sumas son de `lib/money`.
 */
import type { BaseLocal } from '../../../lib/powersync';
import { diaEnBolivia, instanteGuardado } from '../../../lib/diaDelNegocio';
import { esMetodoPago, METODOS_PAGO, type MetodoPago } from '../../../lib/dominio';
import { desdeDecimal, sumar, type Centavos } from '../../../lib/money';
import { listarAbiertas } from '../../ordenes/api/ropaLocal';
import type { OrdenVista } from '../../ordenes/types';

export type CobradoHoy = {
  total: Centavos;
  /** Solo las formas de pago que tuvieron algo, en el orden de siempre (`METODOS_PAGO`). */
  porMetodo: { metodo: MetodoPago; monto: Centavos }[];
};

export type Hoy = {
  /** Toda la ropa que sigue en el local, esperando que la entreguen: la que lleva más tiempo, arriba. */
  porEntregar: OrdenVista[];
  /** La que sigue en el local con la fecha estimada ya pasada (también está en `porEntregar`): la más atrasada, arriba. */
  atrasadas: OrdenVista[];
  cobrado: CobradoHoy;
};

/** La fecha estimada es de calendario (DATE): se comparan los `YYYY-MM-DD` tal cual. */
function estaAtrasada(orden: OrdenVista, hoy: string): boolean {
  const enElLocal = orden.estado === 'RECIBIDO';
  return enElLocal && orden.fechaEstimada !== null && orden.fechaEstimada.slice(0, 10) < hoy;
}

/**
 * Lo cobrado en la sucursal en el día de Bolivia `hoy`. Las fechas de pago se guardan en UTC: un
 * día de Bolivia (UTC-4) va de las 04:00 de ese día a las 04:00 del siguiente en UTC, así que todo
 * pago de hoy tiene fecha UTC de hoy o de mañana. El SQL descarta lo anterior (`>= hoy` compara el
 * texto, y los dos formatos empiezan por la fecha), y lo de cada pago se decide con
 * `diaEnBolivia`, que entiende los dos formatos (`instanteGuardado`).
 */
async function cobradoHoy(base: BaseLocal, sucursalId: string, hoy: string): Promise<CobradoHoy> {
  const filas = await base.consultar('SELECT monto, metodo, fecha_pago FROM pagos WHERE sucursal_id = ? AND fecha_pago >= ?', [
    sucursalId,
    hoy,
  ]);
  const porMetodo = new Map<MetodoPago, Centavos[]>();
  for (const { monto, metodo, fecha_pago } of filas) {
    if (typeof monto !== 'string' || !esMetodoPago(metodo) || typeof fecha_pago !== 'string') continue;
    const instante = instanteGuardado(fecha_pago);
    if (instante === null || diaEnBolivia(instante) !== hoy) continue;
    porMetodo.set(metodo, [...(porMetodo.get(metodo) ?? []), desdeDecimal(monto)]);
  }
  const desglose = METODOS_PAGO.filter((m) => porMetodo.has(m)).map((metodo) => ({
    metodo,
    monto: sumar(...(porMetodo.get(metodo) ?? [])),
  }));
  return { total: sumar(...desglose.map((d) => d.monto)), porMetodo: desglose };
}

export async function hoyEnLaSucursal(base: BaseLocal, sucursalId: string, hoy: string): Promise<Hoy> {
  const [enElLocal, cobrado] = await Promise.all([listarAbiertas(base, sucursalId), cobradoHoy(base, sucursalId, hoy)]);
  // `listarAbiertas` ya viene de la más vieja a la más nueva: es el orden de "por entregar". Desde SPEC-KRILINXI-067
  // no hay pasos intermedios: toda la ropa abierta está RECIBIDA, y es la que falta entregar.
  const porEntregar = enElLocal.filter((orden) => orden.estado === 'RECIBIDO');
  const atrasadas = enElLocal
    .filter((orden) => estaAtrasada(orden, hoy))
    .sort((a, b) => (a.fechaEstimada ?? '').localeCompare(b.fechaEstimada ?? ''));
  return { porEntregar, atrasadas, cobrado };
}
