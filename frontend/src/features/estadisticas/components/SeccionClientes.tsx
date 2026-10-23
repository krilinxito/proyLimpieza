import { Paginas } from '../../../components/Paginas';
import { useClientesAtendidos } from '../hooks/useClientesAtendidos';
import { fechaParaLeer, type Filtro } from '../periodo';
import type { Atenciones } from '../types';
import { Detalle } from './Detalle';
import { BarrasHorizontales } from './graficos/BarrasHorizontales';
import { COLOR_UNICO } from './graficos/colores';
import { hayDatos } from './graficos/escalas';
import { Grafico } from './graficos/Grafico';
import { AvisoDeTarjeta, Esqueleto } from './Esqueleto';
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
 * ¿Quiénes son los clientes que más vienen? — SPEC-KRILINXI-016, como gráfico desde SPEC-KRILINXI-042:
 * una barra por cliente, de quien más vino a quien menos (así los manda el servidor), con cuántas
 * veces vino. Se pagina aparte del resto del panel (`useClientesAtendidos`), y por eso tiene su
 * propio aviso si se corta internet al pasar de página. El gráfico dibuja los de la página que se está
 * viendo; cada cliente, con lo que pagó y cada sucursal, queda en "Ver el detalle", plegado.
 */
export function SeccionClientes({ filtro, periodo }: { filtro: Filtro; periodo: string }) {
  const { estado, recargar, pagina, irAPagina } = useClientesAtendidos(filtro);

  return (
    <SeccionPanel nombre="Clientes atendidos" pregunta="¿Quiénes son los clientes que más vienen?" periodo={periodo}>
      {estado.tipo === 'cargando' && <Esqueleto texto="Buscando los clientes…" />}

      {(estado.tipo === 'sin-conexion' || estado.tipo === 'error') && <AvisoDeTarjeta estado={estado} recargar={recargar} />}

      {estado.tipo === 'listo' && estado.datos.clientes.length === 0 && (
        <p className="mt-4 text-xl text-texto-suave">No vino ningún cliente en este período.</p>
      )}

      {estado.tipo === 'listo' && estado.datos.clientes.length > 0 && (
        <>
          <Grafico
            nombre="Veces que vino cada cliente"
            vacio={!hayDatos(estado.datos.clientes.map((c) => c.ordenes))}
            pista="Toca un cliente para ver cuánto pagó y cuándo vino por última vez."
            tabla={{
              encabezados: ['Cliente', 'Veces que vino', 'Pagó', 'Última vez'],
              filas: estado.datos.clientes.map((c) => ({
                clave: c.cliente.id,
                celdas: [`${c.cliente.nombre} (${c.cliente.telefono})`, veces(c.ordenes), bs(c.gastado), visita(c.ultimaVisita)],
              })),
            }}
          >
            {(elegir) => (
              <BarrasHorizontales
                maximo={Math.max(0, ...estado.datos.clientes.map((c) => c.ordenes))}
                elegir={elegir}
                barras={estado.datos.clientes.map((c) => ({
                  clave: c.cliente.id,
                  etiqueta: c.cliente.nombre,
                  rotulo: `Vino ${veces(c.ordenes)}`,
                  tramos: [{ clave: 'veces', valor: c.ordenes, clase: COLOR_UNICO.marca }],
                  detalle: `${c.cliente.nombre} (${c.cliente.telefono}): ${resumen(c)}`,
                }))}
              />
            )}
          </Grafico>
          {/* Fuera del detalle: pasar de página cambia también el gráfico, no solo la lista. */}
          <Paginas pagina={pagina} total={estado.datos.total} porPagina={estado.datos.porPagina} irAPagina={irAPagina} nombre="Páginas de clientes" />
          <Detalle>
            <ul className="mt-2 grid gap-3">
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
          </Detalle>
        </>
      )}
    </SeccionPanel>
  );
}
