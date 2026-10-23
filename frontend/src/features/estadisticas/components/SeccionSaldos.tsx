import { Paginas } from '../../../components/Paginas';
import { usePaginado } from '../../../hooks/usePaginado';
import { esEstadoOrden, TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import type { Saldos } from '../types';
import { Antiguedad } from './Antiguedad';
import { Detalle } from './Detalle';
import { bs, dias } from './montos';
import { SeccionPanel } from './SeccionPanel';

/**
 * ¿Cuánto falta cobrar, y desde hace cuánto? — SPEC-KRILINXI-015. El gráfico por antigüedad responde
 * de un vistazo (SPEC-KRILINXI-026); cada boleta con saldo queda en "Ver el detalle", plegado
 * (SPEC-KRILINXI-042).
 */
export function SeccionSaldos({ saldos, periodo }: { saldos: Saldos; periodo: string }) {
  const paginas = usePaginado(saldos.ordenes, saldos);
  return (
    <SeccionPanel nombre="Falta cobrar" pregunta="¿Cuánto falta cobrar, y desde hace cuánto?" periodo={periodo}>
      <p className="mt-2 text-3xl font-bold text-texto">{bs(saldos.total)}</p>
      <Antiguedad nombre="Falta cobrar según los días" tramos={saldos.porAntiguedad} queFalta="sin cobrar" paleta="deuda" />
      {saldos.ordenes.length === 0 ? (
        <p className="mt-4 text-xl text-texto-suave">Nadie debe nada en este período.</p>
      ) : (
        <Detalle>
          <ul aria-label="Boletas con saldo" className="mt-2 grid gap-3">
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
          <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre="Páginas de las boletas con saldo" />
        </Detalle>
      )}
    </SeccionPanel>
  );
}
