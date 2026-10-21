import { Link } from 'react-router-dom';
import { Insignia } from '../../../components/Insignia';
import { ESTILO_TARJETA, SenalTocable } from '../../../components/Tarjeta';
import { TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import { formatearBs } from '../../../lib/money';
import { TONO_ESTADO } from '../../ordenes/estado';
import { fechaCorta } from '../../ordenes/components/fechas';
import { enlaceABoleta } from '../../mostrador/components/PantallaMostrador';
import type { BoletaListada } from '../types';

/** Lo que falta pagar, en palabras. Una anulada no se cobra, aunque su cuenta no dé cero. */
export function textoDelSaldo(boleta: Pick<BoletaListada, 'estado' | 'saldo'>): string {
  if (boleta.estado === 'ANULADO') return 'Anulada: no se cobra';
  return boleta.saldo > 0 ? `Falta pagar ${formatearBs(boleta.saldo)}` : 'Pagado';
}

function Contenido({ boleta }: { boleta: BoletaListada }) {
  const debe = boleta.estado !== 'ANULADO' && boleta.saldo > 0;
  return (
    <span className="block min-w-0 flex-1">
      <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-2xl font-bold text-texto">Boleta {boleta.numeroBoleta}</span>
        <Insignia tono={TONO_ESTADO[boleta.estado]}>{TEXTO_ESTADO_ORDEN[boleta.estado]}</Insignia>
      </span>
      <span className="mt-1 block font-semibold text-texto">{boleta.clienteNombre}</span>
      <span className="mt-2 flex flex-wrap justify-between gap-x-4 text-texto-suave">
        <span>
          {boleta.dia ? `Entró el ${fechaCorta(boleta.dia)}` : 'Sin fecha de entrada'}
          {boleta.sucursalNombre && ` · ${boleta.sucursalNombre}`}
        </span>
        <span className={debe ? 'font-semibold text-peligro-texto' : 'text-exito-texto'}>{textoDelSaldo(boleta)}</span>
      </span>
    </span>
  );
}

const CLASES = `flex w-full items-center gap-3 text-left text-xl ${ESTILO_TARJETA.toca}`;

type Props = {
  boleta: BoletaListada;
  /**
   * Qué pasa al tocarla. De la sucursal de trabajo se abre en el Mostrador (un enlace: lleva a otra
   * pantalla); la del admin que no atiende se abre acá mismo, de solo lectura (un botón).
   */
  destino: { tipo: 'mostrador' } | { tipo: 'detalle'; alElegir: () => void };
};

/**
 * Una boleta de la lista, entera tocable: número, cliente, cuándo entró, cómo va y cuánto falta
 * pagar — SPEC-KRILINXI-041. Se ve como una tarjeta que se toca, con su flecha (SPEC-KRILINXI-037).
 */
export function FilaDeBoleta({ boleta, destino }: Props) {
  const nombre = `Boleta ${boleta.numeroBoleta}, ${boleta.clienteNombre}`;
  if (destino.tipo === 'mostrador') {
    return (
      <Link to={enlaceABoleta({ id: boleta.id, clienteId: boleta.clienteId })} aria-label={nombre} className={CLASES}>
        <Contenido boleta={boleta} />
        <SenalTocable />
      </Link>
    );
  }
  return (
    <button type="button" onClick={destino.alElegir} aria-label={nombre} className={CLASES}>
      <Contenido boleta={boleta} />
      <SenalTocable />
    </button>
  );
}
