import { Insignia } from '../../../components/Insignia';
import { ESTILO_TARJETA, SenalTocable } from '../../../components/Tarjeta';
import { TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import { formatearBs } from '../../../lib/money';
import { TONO_ESTADO } from '../estado';
import type { OrdenVista } from '../types';
import { fechaCorta } from './fechas';

/**
 * Una ropa en la lista, entera tocable: boleta, cliente, qué es, cómo va y cuánto debe —
 * SPEC-KRILINXI-008. Un botón grande y no una fila de tabla: se usa con el dedo.
 *
 * Es una tarjeta que se toca (SPEC-KRILINXI-037): borde firme, sombra y la flecha a la derecha, para
 * que se vea distinta de las que solo informan. Es un `<button>`, que no puede llevar una `Tarjeta`
 * adentro (solo admite elementos en línea), así que usa `ESTILO_TARJETA.toca`. El estado va en una
 * `Insignia`, con su palabra y el tono de `TONO_ESTADO`.
 */
export function TarjetaOrden({ orden, alElegir }: { orden: OrdenVista; alElegir: () => void }) {
  return (
    <button
      type="button"
      onClick={alElegir}
      aria-label={`Boleta ${orden.numeroBoleta}, ${orden.clienteNombre}`}
      className={`flex w-full items-center gap-3 text-left text-xl ${ESTILO_TARJETA.toca}`}
    >
      <span className="block min-w-0 flex-1">
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
      </span>
      <SenalTocable />
    </button>
  );
}
