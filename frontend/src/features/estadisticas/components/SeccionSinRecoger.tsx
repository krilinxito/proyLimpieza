import { Paginas } from '../../../components/Paginas';
import { usePaginado } from '../../../hooks/usePaginado';
import type { SinRecoger } from '../types';
import { Antiguedad } from './Antiguedad';
import { Detalle } from './Detalle';
import { boletas, bs, dias } from './montos';
import { SeccionPanel } from './SeccionPanel';

/**
 * ¿Cuánta ropa falta recoger, y desde hace cuánto? — SPEC-KRILINXI-015. El gráfico por antigüedad
 * responde de un vistazo (SPEC-KRILINXI-026); cada boleta queda en "Ver el detalle", plegado
 * (SPEC-KRILINXI-042).
 */
export function SeccionSinRecoger({ sinRecoger, periodo }: { sinRecoger: SinRecoger; periodo: string }) {
  const paginas = usePaginado(sinRecoger.ordenes, sinRecoger);
  return (
    <SeccionPanel nombre="Ropa sin recoger" pregunta="¿Cuánta ropa falta recoger, y desde hace cuánto?" periodo={periodo} ampliable={sinRecoger.porAntiguedad.some((t) => t.cantidad > 0)}>
      <p className="mt-2 text-3xl font-bold text-texto">{boletas(sinRecoger.cantidad)}</p>
      <Antiguedad nombre="Ropa sin recoger según los días" tramos={sinRecoger.porAntiguedad} queFalta="sin recoger" />
      {sinRecoger.ordenes.length === 0 ? (
        <p className="mt-4 text-xl text-texto-suave">No hay ropa sin recoger en este período.</p>
      ) : (
        <Detalle>
          <ul aria-label="Boletas sin recoger" className="mt-2 grid gap-3">
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
          <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre="Páginas de las boletas sin recoger" />
        </Detalle>
      )}
    </SeccionPanel>
  );
}
