import { TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import { formatearBs } from '../../../lib/money';
import type { OrdenVista } from '../types';
import { fechaCorta } from './fechas';

/**
 * Una ropa en la lista, entera tocable: boleta, cliente, qué es, cómo va y cuánto debe —
 * SPEC-KRILINXI-008. Un botón grande y no una fila de tabla: se usa con el dedo.
 */
export function TarjetaOrden({ orden, alElegir }: { orden: OrdenVista; alElegir: () => void }) {
  return (
    <button
      type="button"
      onClick={alElegir}
      aria-label={`Boleta ${orden.numeroBoleta}, ${orden.clienteNombre}`}
      className="w-full rounded-lg border-2 border-slate-300 bg-white p-4 text-left text-xl"
    >
      <span className="flex justify-between gap-4 font-semibold text-slate-900">
        <span>Boleta {orden.numeroBoleta}</span>
        <span>{TEXTO_ESTADO_ORDEN[orden.estado]}</span>
      </span>
      <span className="mt-1 block text-slate-800">{orden.clienteNombre}</span>
      <span className="mt-1 block text-slate-600">{orden.descripcion}</span>
      <span className="mt-1 flex justify-between gap-4 text-slate-700">
        <span>{orden.fechaEstimada ? `Para el ${fechaCorta(orden.fechaEstimada)}` : 'Sin fecha'}</span>
        <span>{orden.saldo > 0 ? `Falta pagar ${formatearBs(orden.saldo)}` : 'Pagado'}</span>
      </span>
    </button>
  );
}
