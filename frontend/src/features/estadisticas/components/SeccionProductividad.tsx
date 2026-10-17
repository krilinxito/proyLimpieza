import type { Productividad } from '../types';
import { bs } from './montos';

const veces = (n: number) => (n === 1 ? '1 vez' : `${n} veces`);

/**
 * Lo que hizo cada persona, por sucursal — SPEC-KRILINXI-016. Quien trabajó en dos sucursales
 * aparece dos veces: cada registro cuenta en la sucursal donde se hizo (SPEC-ALE186-012).
 */
export function SeccionProductividad({ productividad, periodo }: { productividad: Productividad; periodo: string }) {
  return (
    <section aria-label="Lo que hizo cada persona" className="mt-8">
      <h2 className="text-2xl font-bold text-slate-900">Lo que hizo cada persona {periodo}</h2>
      {productividad.porEmpleado.length === 0 ? (
        <p className="mt-4 text-xl text-slate-700">Nadie registró nada en este período.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {productividad.porEmpleado.map((f) => (
            <li key={`${f.usuario.id}-${f.sucursal.id}`} className="rounded-lg border-2 border-slate-300 bg-white p-4 text-xl">
              <p className="font-semibold text-slate-900">
                {f.usuario.nombreCompleto} — {f.sucursal.nombre}
              </p>
              <p className="mt-1 text-slate-800">
                Recibió {f.ordenesRecibidas} · Cobró {veces(f.cobros)} ({bs(f.montoCobrado)}) · Entregó {f.entregas}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
