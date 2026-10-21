import { Paginas } from '../../../components/Paginas';
import { usePaginado } from '../../../hooks/usePaginado';
import { esEstadoOrden, TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import type { Saldos } from '../types';
import { Antiguedad } from './Antiguedad';
import { bs, dias } from './montos';
import { SeccionPanel } from './SeccionPanel';

/** Lo que los clientes todavía deben: el gráfico por antigüedad y, debajo, cada boleta. */
export function SeccionSaldos({ saldos, periodo }: { saldos: Saldos; periodo: string }) {
  const paginas = usePaginado(saldos.ordenes, saldos);
  return (
    <SeccionPanel nombre="Falta cobrar" titulo={`Falta cobrar ${periodo}`}>
      <p className="mt-2 text-3xl font-bold text-texto">{bs(saldos.total)}</p>
      <Antiguedad nombre="Falta cobrar según los días" tramos={saldos.porAntiguedad} queFalta="sin cobrar" />
      {saldos.ordenes.length === 0 ? (
        <p className="mt-4 text-xl text-texto-suave">Nadie debe nada en este período.</p>
      ) : (
        <ul aria-label="Boletas con saldo" className="mt-4 grid gap-3">
          {(paginas.visibles ?? []).map((o) => (
            <li key={o.ordenId} className="rounded-xl border border-borde-suave p-4 text-xl">
              <p className="font-semibold text-texto">
                Boleta {o.numeroBoleta} — {o.cliente}
              </p>
              <p className="mt-1 text-texto-suave">
                Debe {bs(o.saldoPendiente)} de {bs(o.montoACobrar)} · {esEstadoOrden(o.estado) ? TEXTO_ESTADO_ORDEN[o.estado] : o.estado} ·
                hace {dias(o.dias)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre="Páginas de las boletas con saldo" />
    </SeccionPanel>
  );
}
