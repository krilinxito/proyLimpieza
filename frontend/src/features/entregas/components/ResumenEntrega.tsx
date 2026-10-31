import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { formatearBs } from '../../../lib/money';
import type { EntregaLista } from '../types';

/** Lo que quedó registrado al entregar — SPEC-KRILINXI-009. */
export function ResumenEntrega({ entrega, alEntregarOtra }: { entrega: EntregaLista; alEntregarOtra: () => void }) {
  const reembolso = entrega.reembolso;
  const filas: [string, string][] = [
    ['Boleta', entrega.numeroBoleta],
    [
      'Retiró',
      entrega.tipoRetiro === 'CON_BOLETA'
        ? 'Trajo la boleta'
        : `${entrega.retiradoPorNombre ?? ''} (carnet ${entrega.retiradoPorCarnet ?? ''})`,
    ],
    // Sin cobrar (SPEC-KRILINXI-070) el precio final es lo que ya había pagado: se dice lo que se perdonó y por qué.
    ...(reembolso
      ? ([
          ['Ya había pagado', formatearBs(entrega.precioFinal)],
          ['No se cobró', formatearBs(reembolso.noCobrado)],
          ['Motivo', reembolso.motivo],
        ] as [string, string][])
      : ([
          ['Precio final', formatearBs(entrega.precioFinal)],
          ['Cobrado ahora', entrega.pagoFinal > 0 ? formatearBs(entrega.pagoFinal) : 'Nada'],
        ] as [string, string][])),
  ];

  return (
    <section className="mt-6">
      <Aviso tipo="exito">
        {reembolso ? `Ropa entregada sin cobrar: boleta ${entrega.numeroBoleta}.` : `Ropa entregada: boleta ${entrega.numeroBoleta}.`}
      </Aviso>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl border border-borde-suave bg-superficie p-4 text-xl">
        {filas.map(([dato, valor]) => (
          <div key={dato} className="contents">
            <dt className="font-semibold text-texto-suave">{dato}</dt>
            <dd className="text-texto">{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6">
        <Boton onClick={alEntregarOtra}>Entregar otra ropa</Boton>
      </div>
    </section>
  );
}
