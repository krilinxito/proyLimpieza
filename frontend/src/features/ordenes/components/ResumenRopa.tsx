import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { formatearBs } from '../../../lib/money';
import type { RopaRegistrada } from '../types';
import { fechaCorta } from './fechas';

type Props = {
  ropa: RopaRegistrada;
  /** Qué sigue después de repasarlo. */
  alSeguir: () => void;
  /** Lo que dice ese botón: "Registrar otra ropa", o adónde lleva (SPEC-KRILINXI-034). */
  textoSeguir?: string;
};

/** Lo que quedó registrado, para repasarlo con el cliente antes de que se vaya. */
export function ResumenRopa({ ropa, alSeguir, textoSeguir = 'Registrar otra ropa' }: Props) {
  const filas: [string, string][] = [
    ['Boleta', ropa.numeroBoleta],
    ['Cliente', ropa.cliente.nombre],
    ['Ropa', ropa.descripcion],
    ['Precio', formatearBs(ropa.precioTotal)],
    ['Adelanto', ropa.adelanto > 0 ? formatearBs(ropa.adelanto) : 'No dejó'],
    ['Falta pagar', formatearBs(ropa.saldo)],
    ['Estará lista', ropa.fechaEstimada ? fechaCorta(ropa.fechaEstimada) : 'Sin fecha'],
  ];

  return (
    <section className="mt-6">
      <Aviso tipo="exito">Ropa registrada con la boleta {ropa.numeroBoleta}.</Aviso>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl border border-borde-suave bg-superficie p-4 text-xl">
        {filas.map(([dato, valor]) => (
          <div key={dato} className="contents">
            <dt className="font-semibold text-texto-suave">{dato}</dt>
            <dd className="text-texto whitespace-pre-line">{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6">
        <Boton onClick={alSeguir}>{textoSeguir}</Boton>
      </div>
    </section>
  );
}
