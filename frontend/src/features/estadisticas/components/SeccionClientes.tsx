import { Boton } from '../../../components/Boton';
import { Paginas } from '../../../components/Paginas';
import { useClientesAtendidos } from '../hooks/useClientesAtendidos';
import { fechaParaLeer, type Filtro } from '../periodo';
import type { Atenciones } from '../types';
import { bs } from './montos';

/** "2026-10-15 18:30:00" (hora de Bolivia, como la manda el servidor) → "15/10/2026 18:30". */
function visita(ultimaVisita: string): string {
  return `${fechaParaLeer(ultimaVisita)} ${ultimaVisita.slice(11, 16)}`.trim();
}

const veces = (n: number) => (n === 1 ? '1 vez' : `${n} veces`);

function resumen({ ordenes, gastado, ultimaVisita }: Atenciones): string {
  return `Vino ${veces(ordenes)} · Pagó ${bs(gastado)} · Última vez: ${visita(ultimaVisita)}`;
}

/**
 * Los clientes atendidos, de quien más vino a quien menos — SPEC-KRILINXI-016. Se pagina
 * aparte del resto del panel (`useClientesAtendidos`), y por eso tiene su propio aviso si se
 * corta internet al pasar de página.
 */
export function SeccionClientes({ filtro, periodo }: { filtro: Filtro; periodo: string }) {
  const { estado, recargar, pagina, irAPagina } = useClientesAtendidos(filtro);

  return (
    <section aria-label="Clientes atendidos" className="mt-8">
      <h2 className="text-2xl font-bold text-slate-900">Clientes atendidos {periodo}</h2>

      {estado.tipo === 'cargando' && <p className="mt-4 text-xl text-slate-700">Buscando los clientes…</p>}

      {(estado.tipo === 'sin-conexion' || estado.tipo === 'error') && (
        <div role="alert" className="mt-4 rounded-lg bg-amber-50 p-4 text-xl text-amber-900">
          <p>{estado.tipo === 'sin-conexion' ? 'Las estadísticas necesitan conexión.' : estado.mensaje}</p>
          <div className="mt-4">
            <Boton onClick={recargar}>Probar de nuevo</Boton>
          </div>
        </div>
      )}

      {estado.tipo === 'listo' && estado.datos.clientes.length === 0 && (
        <p className="mt-4 text-xl text-slate-700">No vino ningún cliente en este período.</p>
      )}

      {estado.tipo === 'listo' && estado.datos.clientes.length > 0 && (
        <>
          <ul className="mt-4 grid gap-3">
            {estado.datos.clientes.map((c) => (
              <li key={c.cliente.id} className="rounded-lg border-2 border-slate-300 bg-white p-4 text-xl">
                <p className="font-semibold text-slate-900">
                  {c.cliente.nombre} ({c.cliente.telefono})
                </p>
                <p className="mt-1 text-slate-800">{resumen(c)}</p>
                {c.porSucursal.length > 1 && (
                  <ul className="mt-2 grid gap-1 text-lg text-slate-700">
                    {c.porSucursal.map((s) => (
                      <li key={s.sucursal.id}>
                        {s.sucursal.nombre}: {resumen(s)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <Paginas pagina={pagina} total={estado.datos.total} porPagina={estado.datos.porPagina} irAPagina={irAPagina} nombre="Páginas de clientes" />
        </>
      )}
    </section>
  );
}
