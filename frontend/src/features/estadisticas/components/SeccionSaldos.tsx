import { esEstadoOrden, TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import type { Saldos } from '../types';
import { Antiguedad } from './Antiguedad';
import { bs } from './montos';

const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`);

/** Lo que los clientes todavía deben, con su antigüedad. */
export function SeccionSaldos({ saldos, periodo }: { saldos: Saldos; periodo: string }) {
  return (
    <section aria-label="Falta cobrar" className="mt-8">
      <h2 className="text-2xl font-bold text-slate-900">Falta cobrar {periodo}</h2>
      <p className="mt-2 text-3xl font-bold text-slate-900">{bs(saldos.total)}</p>
      {saldos.ordenes.length === 0 ? (
        <p className="mt-4 text-xl text-slate-700">Nadie debe nada en este período.</p>
      ) : (
        <>
          <Antiguedad tramos={saldos.porAntiguedad} />
          <ul className="mt-4 grid gap-3">
            {saldos.ordenes.map((o) => (
              <li key={o.ordenId} className="rounded-lg border-2 border-slate-300 bg-white p-4 text-xl">
                <p className="font-semibold text-slate-900">
                  Boleta {o.numeroBoleta} — {o.cliente}
                </p>
                <p className="mt-1 text-slate-800">
                  Debe {bs(o.saldoPendiente)} de {bs(o.montoACobrar)} · {esEstadoOrden(o.estado) ? TEXTO_ESTADO_ORDEN[o.estado] : o.estado} ·
                  hace {dias(o.dias)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
