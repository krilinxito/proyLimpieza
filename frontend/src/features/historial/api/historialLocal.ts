/**
 * El historial de boletas de la sucursal, leído de la base local — SPEC-KRILINXI-041.
 *
 * Es lo que ve quien atiende: la ropa de su sucursal de trabajo, por defecto de los últimos 30
 * días, también sin internet (CLAUDE.md §6). No habla con la API. Lee con la misma consulta que el
 * Mostrador (`SELECT_ORDENES`) y arma con la misma regla (`armar`: el estado efectivo, los pagos y
 * el saldo se deciden en un solo lugar), y encuentra al cliente con la misma regla que el buscador
 * (`condicionCliente`, SPEC-KRILINXI-032).
 *
 * Qué va en el SQL y qué después: el SQL achica lo barato (sucursal, texto, un margen de fechas);
 * lo que depende de reglas del dominio se decide al final, en JavaScript, sobre las órdenes ya
 * armadas — el día de Bolivia (las fechas se guardan en dos formatos, ver `instanteGuardado`), el
 * estado que se muestra (ENTREGADO si hay entrega) y el saldo (`pagos/saldo.ts`, el único lugar).
 */
import { diaEnBolivia, instanteGuardado } from '../../../lib/diaDelNegocio';
import type { BaseLocal } from '../../../lib/powersync';
import { escaparLike } from '../../../lib/texto';
import { condicionCliente } from '../../clientes/api/busqueda';
import { DIAS_DE_HISTORIA, restarDias } from '../../estadisticas/periodo';
import { armar, SELECT_ORDENES } from '../../ordenes/api/ropaLocal';
import type { OrdenVista } from '../../ordenes/types';
import { textoParaBuscar, type FiltroHistorial } from '../filtro';
import type { BoletaListada } from '../types';

/** Las fechas que se miran: las elegidas, o los últimos 30 días contando hoy. */
export function fechasDelHistorial(filtro: FiltroHistorial, hoy: string): { desde: string; hasta: string } {
  return filtro.fechas ?? { desde: restarDias(hoy, DIAS_DE_HISTORIA - 1), hasta: hoy };
}

function instanteDe(orden: OrdenVista): number {
  return orden.fechaEntrada ? (instanteGuardado(orden.fechaEntrada) ?? 0) : 0;
}

function aBoleta(orden: OrdenVista, dia: string | null): BoletaListada {
  return {
    id: orden.id,
    numeroBoleta: orden.numeroBoleta,
    clienteId: orden.clienteId,
    clienteNombre: orden.clienteNombre,
    clienteTelefono: orden.clienteTelefono,
    sucursalNombre: null,
    descripcion: orden.descripcion,
    estado: orden.estado,
    dia,
    precioTotal: orden.precioTotal,
    precioFinal: orden.precioFinal,
    retiro: orden.retiro,
    reembolso: orden.reembolso,
    renglones: orden.renglones,
    origen: null,
    pagado: orden.pagado,
    saldo: orden.saldo,
  };
}

/**
 * Todas las boletas de un cliente en la sucursal de trabajo, de la más nueva a la más vieja —
 * SPEC-KRILINXI-061, para "Ver sus boletas" en Clientes. Sin filtro de fechas: es su historia completa en
 * este local. Lee con la misma consulta y arma con la misma regla que el historial (`SELECT_ORDENES`, `armar`).
 */
export async function listarBoletasDelCliente(
  base: BaseLocal,
  sucursalId: string,
  clienteId: string,
): Promise<BoletaListada[]> {
  const filas = await base.consultar(`${SELECT_ORDENES} AND o.cliente_id = ?`, [sucursalId, clienteId]);
  const ordenes = await armar(base, filas);
  return ordenes
    .sort((a, b) => instanteDe(b) - instanteDe(a) || b.id.localeCompare(a.id))
    .map((orden) => {
      const instante = orden.fechaEntrada ? instanteGuardado(orden.fechaEntrada) : null;
      return aBoleta(orden, instante === null ? null : diaEnBolivia(instante));
    });
}

/**
 * Las boletas de la sucursal que cumplen el filtro, de la más nueva a la más vieja. `hoy` es
 * `YYYY-MM-DD` en Bolivia: llega de afuera para que la consulta sea testeable.
 */
export async function listarHistorialLocal(
  base: BaseLocal,
  sucursalId: string,
  filtro: FiltroHistorial,
  hoy: string,
): Promise<BoletaListada[]> {
  const { desde, hasta } = fechasDelHistorial(filtro, hoy);

  // Las dos formas en que se guarda `fecha_entrada` empiezan con el día en UTC (`2026-10-18…`). Bolivia
  // va cuatro horas atrás: a las 02:00 UTC del 18 todavía son las 22:00 del 17. Su día nunca es
  // posterior al de UTC, y a lo sumo es el anterior; por eso al borde de arriba se le suma un día
  // (el de abajo no necesita margen). El día exacto se decide después, en JavaScript.
  let donde = 'AND substr(o.fecha_entrada, 1, 10) BETWEEN ? AND ?';
  const parametros: unknown[] = [sucursalId, desde, restarDias(hasta, -1)];

  const texto = textoParaBuscar(filtro);
  const cliente = texto ? condicionCliente(texto, { nombre: 'c.nombre', telefono: 'c.telefono', carnet: 'c.carnet' }) : null;
  if (cliente) {
    donde += ` AND (o.numero_boleta LIKE ? ESCAPE '\\' OR (${cliente.donde}))`;
    parametros.push(`%${escaparLike(texto)}%`, ...cliente.parametros);
  }

  const filas = await base.consultar(`${SELECT_ORDENES} ${donde}`, parametros);
  const ordenes = await armar(base, filas);

  return ordenes
    .map((orden) => {
      const instante = orden.fechaEntrada ? instanteGuardado(orden.fechaEntrada) : null;
      return { orden, dia: instante === null ? null : diaEnBolivia(instante) };
    })
    .filter(({ orden, dia }) => {
      if (dia === null || dia < desde || dia > hasta) return false;
      if (filtro.estado && orden.estado !== filtro.estado) return false;
      // Como `/saldos` en el servidor: una anulada no se cobra, aunque su cuenta no dé cero.
      if (filtro.conSaldo && (orden.saldo <= 0 || orden.estado === 'ANULADO')) return false;
      return true;
    })
    .sort((a, b) => instanteDe(b.orden) - instanteDe(a.orden))
    .map(({ orden, dia }) => aBoleta(orden, dia));
}
