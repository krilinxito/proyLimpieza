import { Boton } from '../../../components/Boton';
import { formatearBs } from '../../../lib/money';
import type { RopaRegistrada } from '../types';

/** "2026-10-10" → "10/10/2026", como se escribe a mano en la boleta. */
function fechaComoEnLaBoleta(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Lo que quedó registrado, para repasarlo con el cliente antes de que se vaya. */
export function ResumenRopa({ ropa, alRegistrarOtra }: { ropa: RopaRegistrada; alRegistrarOtra: () => void }) {
  const filas: [string, string][] = [
    ['Boleta', ropa.numeroBoleta],
    ['Cliente', ropa.cliente.nombre],
    ['Ropa', ropa.descripcion],
    ['Precio', formatearBs(ropa.precioTotal)],
    ['Adelanto', ropa.adelanto > 0 ? formatearBs(ropa.adelanto) : 'No dejó'],
    ['Falta pagar', formatearBs(ropa.saldo)],
    ['Estará lista', ropa.fechaEstimada ? fechaComoEnLaBoleta(ropa.fechaEstimada) : 'Sin fecha'],
  ];

  return (
    <section className="mt-6">
      <p role="status" className="rounded-lg bg-green-50 p-4 text-xl text-green-900">
        Ropa registrada con la boleta {ropa.numeroBoleta}.
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
        <Boton onClick={alRegistrarOtra}>Registrar otra ropa</Boton>
      </div>
    </section>
  );
}
