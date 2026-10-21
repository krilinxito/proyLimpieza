import { Paginas } from '../../../components/Paginas';
import { usePaginado } from '../../../hooks/usePaginado';
import type { SinRecoger } from '../types';
import { Antiguedad } from './Antiguedad';
import { boletas, bs, dias } from './montos';
import { SeccionPanel } from './SeccionPanel';

/** La ropa que sigue en los locales: el gráfico por antigüedad y, debajo, cada boleta. */
export function SeccionSinRecoger({ sinRecoger, periodo }: { sinRecoger: SinRecoger; periodo: string }) {
  const paginas = usePaginado(sinRecoger.ordenes, sinRecoger);
  return (
    <SeccionPanel nombre="Ropa sin recoger" titulo={`Ropa sin recoger ${periodo}`}>
      <p className="mt-2 text-3xl font-bold text-texto">{boletas(sinRecoger.cantidad)}</p>
      <Antiguedad nombre="Ropa sin recoger según los días" tramos={sinRecoger.porAntiguedad} queFalta="sin recoger" />
      {sinRecoger.ordenes.length === 0 ? (
        <p className="mt-4 text-xl text-texto-suave">No hay ropa sin recoger en este período.</p>
      ) : (
        <ul aria-label="Boletas sin recoger" className="mt-4 grid gap-3">
          {(paginas.visibles ?? []).map((o) => (
            <li key={o.ordenId} className="rounded-xl border border-borde-suave p-4 text-xl">
              <p className="font-semibold text-texto">
                Boleta {o.numeroBoleta} — {o.cliente}
                {o.telefono && ` (${o.telefono})`}
              </p>
              <p className="mt-1 text-texto-suave">
                {o.descripcion} · {o.sucursal} · {bs(o.precioTotal)} · hace {dias(o.dias)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre="Páginas de las boletas sin recoger" />
    </SeccionPanel>
  );
}
