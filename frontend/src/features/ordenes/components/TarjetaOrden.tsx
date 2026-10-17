import { Insignia } from '../../../components/Insignia';
import { TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import { formatearBs } from '../../../lib/money';
import { TONO_ESTADO } from '../estado';
import type { OrdenVista } from '../types';
import { fechaCorta } from './fechas';

/**
 * Una ropa en la lista, entera tocable: boleta, cliente, qué es, cómo va y cuánto debe —
 * SPEC-KRILINXI-008. Un botón grande y no una fila de tabla: se usa con el dedo.
 *
 * Se ve como una tarjeta del tema (SPEC-KRILINXI-025), pero es un `<button>`: no puede llevar
 * una `Tarjeta` adentro (un botón solo admite texto y elementos en línea), así que repite sus
 * clases. El estado va en una `Insignia`, con su palabra y el tono de `TONO_ESTADO`.
 */
export function TarjetaOrden({ orden, alElegir }: { orden: OrdenVista; alElegir: () => void }) {
  return (
    <button
      type="button"
      onClick={alElegir}
      aria-label={`Boleta ${orden.numeroBoleta}, ${orden.clienteNombre}`}
      className="w-full rounded-2xl border-2 border-borde-suave bg-superficie p-4 text-left text-xl shadow-sm transition-colors hover:border-marca focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-2xl font-bold text-texto">Boleta {orden.numeroBoleta}</span>
        <Insignia tono={TONO_ESTADO[orden.estado]}>{TEXTO_ESTADO_ORDEN[orden.estado]}</Insignia>
      </span>
      <span className="mt-1 block font-semibold text-texto">{orden.clienteNombre}</span>
      <span className="mt-1 block text-texto-suave">{orden.descripcion}</span>
      <span className="mt-2 flex flex-wrap justify-between gap-x-4 text-texto-suave">
        <span>{orden.fechaEstimada ? `Para el ${fechaCorta(orden.fechaEstimada)}` : 'Sin fecha'}</span>
        <span className={orden.saldo > 0 ? 'font-semibold text-peligro-texto' : 'text-exito-texto'}>
          {orden.saldo > 0 ? `Falta pagar ${formatearBs(orden.saldo)}` : 'Pagado'}
        </span>
      </span>
    </button>
  );
}
