import { fechaParaLeer } from '../periodo';
import type { Volumen } from '../types';

const boletas = (n: number) => (n === 1 ? '1 boleta' : `${n} boletas`);
const anuladas = (n: number) => (n === 1 ? '1 anulada' : `${n} anuladas`);

/**
 * Cuánta ropa entró cada día — SPEC-KRILINXI-016. Vienen todos los días del período, también
 * los que quedan en 0: un día sin ropa es un dato, no un hueco. La barra solo es una ayuda
 * para comparar: el número está escrito al lado.
 */
export function SeccionVolumen({ volumen, periodo }: { volumen: Volumen; periodo: string }) {
  const maximo = Math.max(1, ...volumen.porDia.map((d) => d.ordenes));
  return (
    <section aria-label="Ropa recibida" className="mt-8">
      <h2 className="text-2xl font-bold text-slate-900">Ropa recibida {periodo}</h2>
      <p className="mt-2 text-3xl font-bold text-slate-900">{boletas(volumen.total)}</p>
      {volumen.anuladas > 0 && <p className="mt-1 text-xl text-slate-700">De esas, {anuladas(volumen.anuladas)}.</p>}
      <ul className="mt-4 grid gap-2">
        {volumen.porDia.map((dia) => (
          <li key={dia.fecha} className="grid grid-cols-[8rem_1fr] items-center gap-3 text-xl">
            <span className="text-slate-700">{fechaParaLeer(dia.fecha)}</span>
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className="h-6 rounded bg-sky-600" style={{ width: `${(dia.ordenes / maximo) * 60}%` }} />
              <span className="text-slate-900">
                {boletas(dia.ordenes)}
                {dia.anuladas > 0 && ` (${anuladas(dia.anuladas)})`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
