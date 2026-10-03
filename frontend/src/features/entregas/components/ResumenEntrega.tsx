import { Boton } from '../../../components/Boton';
import { formatearBs } from '../../../lib/money';
import type { EntregaLista } from '../types';

/** Lo que quedó registrado al entregar — SPEC-KRILINXI-009. */
export function ResumenEntrega({ entrega, alEntregarOtra }: { entrega: EntregaLista; alEntregarOtra: () => void }) {
  const filas: [string, string][] = [
    ['Boleta', entrega.numeroBoleta],
    [
      'Retiró',
      entrega.tipoRetiro === 'CON_BOLETA'
        ? 'Trajo la boleta'
        : `${entrega.retiradoPorNombre ?? ''} (carnet ${entrega.retiradoPorCarnet ?? ''})`,
    ],
    ['Precio final', formatearBs(entrega.precioFinal)],
    ['Cobrado ahora', entrega.pagoFinal > 0 ? formatearBs(entrega.pagoFinal) : 'Nada'],
    ['Queda debiendo', entrega.saldoDespues > 0 ? formatearBs(entrega.saldoDespues) : 'Nada'],
  ];

  return (
    <section className="mt-6">
      <p role="status" className="rounded-lg bg-green-50 p-4 text-xl text-green-900">
        Ropa entregada: boleta {entrega.numeroBoleta}.
      </p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border-2 border-slate-300 bg-white p-4 text-xl">
        {filas.map(([dato, valor]) => (
          <div key={dato} className="contents">
            <dt className="font-semibold text-slate-700">{dato}</dt>
            <dd className="text-slate-900">{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6">
        <Boton onClick={alEntregarOtra}>Entregar otra ropa</Boton>
      </div>
    </section>
  );
}
