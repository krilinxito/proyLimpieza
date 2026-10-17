import { fechaParaLeer } from '../periodo';
import type { Volumen } from '../types';

/**
 * El ancho de la barra como clase, en pasos de 5 % hasta 60 %: sin `style` en línea, que la
 * política de seguridad bloquea (SPEC-KRILINXI-020). Las clases van escritas enteras a
 * propósito: Tailwind solo genera las que encuentra literales en el código.
 */
const ANCHOS = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
] as const;

export function anchoDeBarra(valor: number, maximo: number): string {
  const paso = Math.round((valor / maximo) * (ANCHOS.length - 1));
  // Un día con algo de ropa nunca queda sin barra, aunque sea la mínima.
  const conAlgo = valor > 0 ? Math.max(1, paso) : 0;
  return ANCHOS[Math.min(conAlgo, ANCHOS.length - 1)] ?? 'w-0';
}

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
              <span aria-hidden="true" className={`h-6 rounded bg-sky-600 ${anchoDeBarra(dia.ordenes, maximo)}`} />
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
