import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { Paginas } from '../../../components/Paginas';
import { useClientesAtendidos } from '../hooks/useClientesAtendidos';
import { fechaParaLeer, type Filtro } from '../periodo';
import type { Atenciones } from '../types';
import { bs, veces } from './montos';
import { SeccionPanel } from './SeccionPanel';

/** "2026-10-15 18:30:00" (hora de Bolivia, como la manda el servidor) → "15/10/2026 18:30". */
function visita(ultimaVisita: string): string {
  return `${fechaParaLeer(ultimaVisita)} ${ultimaVisita.slice(11, 16)}`.trim();
}

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
    <SeccionPanel nombre="Clientes atendidos" titulo={`Clientes atendidos ${periodo}`}>

      {estado.tipo === 'cargando' && <p className="mt-4 text-xl text-texto-suave">Buscando los clientes…</p>}

      {(estado.tipo === 'sin-conexion' || estado.tipo === 'error') && (
        <div className="mt-4">
          <Aviso tipo={estado.tipo === 'sin-conexion' ? 'advertencia' : 'error'}>
            <p>{estado.tipo === 'sin-conexion' ? 'Las estadísticas necesitan conexión.' : estado.mensaje}</p>
            <div className="mt-4">
              <Boton onClick={recargar}>Probar de nuevo</Boton>
            </div>
          </Aviso>
        </div>
      )}

      {estado.tipo === 'listo' && estado.datos.clientes.length === 0 && (
        <p className="mt-4 text-xl text-texto-suave">No vino ningún cliente en este período.</p>
      )}

      {estado.tipo === 'listo' && estado.datos.clientes.length > 0 && (
        <>
          <ul className="mt-4 grid gap-3">
            {estado.datos.clientes.map((c) => (
              <li key={c.cliente.id} className="rounded-xl border border-borde-suave p-4 text-xl">
                <p className="font-semibold text-texto">
                  {c.cliente.nombre} ({c.cliente.telefono})
                </p>
                <p className="mt-1 text-texto-suave">{resumen(c)}</p>
                {c.porSucursal.length > 1 && (
                  <ul className="mt-2 grid gap-1 text-lg text-texto-suave">
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
    </SeccionPanel>
  );
}
