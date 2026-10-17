import type { SinRecoger } from '../types';
import { Antiguedad } from './Antiguedad';
import { bs } from './montos';

const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`);

/** La ropa que sigue en los locales, con su antigüedad. */
export function SeccionSinRecoger({ sinRecoger, periodo }: { sinRecoger: SinRecoger; periodo: string }) {
  return (
    <section aria-label="Ropa sin recoger" className="mt-8">
      <h2 className="text-2xl font-bold text-slate-900">Ropa sin recoger {periodo}</h2>
      <p className="mt-2 text-3xl font-bold text-slate-900">
        {sinRecoger.cantidad} {sinRecoger.cantidad === 1 ? 'boleta' : 'boletas'}
      </p>
      {sinRecoger.ordenes.length === 0 ? (
        <p className="mt-4 text-xl text-slate-700">No hay ropa sin recoger en este período.</p>
      ) : (
        <>
          <Antiguedad tramos={sinRecoger.porAntiguedad} />
          <ul className="mt-4 grid gap-3">
            {sinRecoger.ordenes.map((o) => (
              <li key={o.ordenId} className="rounded-lg border-2 border-slate-300 bg-white p-4 text-xl">
                <p className="font-semibold text-slate-900">
                  Boleta {o.numeroBoleta} — {o.cliente}
                  {o.telefono && ` (${o.telefono})`}
                </p>
                <p className="mt-1 text-slate-800">
                  {o.descripcion} · {o.sucursal} · {bs(o.precioTotal)} · hace {dias(o.dias)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
