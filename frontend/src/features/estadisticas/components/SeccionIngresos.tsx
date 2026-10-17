import { METODOS_PAGO, TEXTO_METODO_PAGO } from '../../../lib/dominio';
import type { Ingresos } from '../types';
import { bs } from './montos';

/** Cuánto se cobró, por sucursal y por forma de pago. Los totales vienen sumados del servidor. */
export function SeccionIngresos({ ingresos, periodo }: { ingresos: Ingresos; periodo: string }) {
  return (
    <section aria-label="Cobrado" className="mt-8">
      <h2 className="text-2xl font-bold text-slate-900">Cobrado {periodo}</h2>
      <p className="mt-2 text-3xl font-bold text-slate-900">{bs(ingresos.total)}</p>
      {ingresos.porSucursal.length === 0 ? (
        <p className="mt-4 text-xl text-slate-700">No hubo cobros en este período.</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {ingresos.porSucursal.map((s) => (
            <li key={s.sucursalId} className="rounded-lg border-2 border-slate-300 bg-white p-4">
              <p className="text-xl font-semibold text-slate-900">
                {s.sucursal}: {bs(s.total)}
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xl">
                {METODOS_PAGO.map((m) => (
                  <div key={m} className="contents">
                    <dt className="text-slate-700">{TEXTO_METODO_PAGO[m]}</dt>
                    <dd className="text-slate-900">{bs(s.porMetodo[m])}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
