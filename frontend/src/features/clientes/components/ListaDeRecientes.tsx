import { Boton } from '../../../components/Boton';
import { EnlaceBoton } from '../../../components/EnlaceBoton';
import { Paginas } from '../../../components/Paginas';
import { Tarjeta } from '../../../components/Tarjeta';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { enlaceABoletasDe } from '../../historial/components/BoletasDelCliente';
import { useClientesRecientes } from '../hooks/useClientesRecientes';
import type { Cliente } from '../types';

/**
 * Los clientes que vinieron hace menos, antes de buscar nada — SPEC-KRILINXI-061. El de la última boleta
 * más reciente va primero, y el resto se pagina con la barra de siempre (CLAUDE.md §9). Todo sale de la
 * base local: funciona igual sin internet.
 *
 * Cada cliente es una tarjeta con dos salidas: ver sus datos (donde se cambian) y ver sus boletas. Esta
 * última solo se ofrece con sucursal de trabajo, porque las boletas que muestra son las de esa sucursal.
 */
export function ListaDeRecientes({ alElegir }: { alElegir: (cliente: Cliente) => void }) {
  const { clientes, total, porPagina, pagina, irAPagina } = useClientesRecientes();
  const conSucursal = useSucursalDeTrabajo() !== null;

  if (clientes === null) return <p className="mt-8 text-xl text-texto-suave">Buscando…</p>;

  return (
    <section aria-label="Últimos clientes" className="mt-8">
      <h2 className="text-2xl font-bold text-texto">Últimos clientes atendidos</h2>
      {total === 0 ? (
        <p className="mt-4 text-xl text-texto-suave">Todavía no hay clientes. Toca «Cliente nuevo» para anotar el primero.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {clientes.map((cliente) => (
            <li key={cliente.id}>
              <Tarjeta titulo={cliente.nombre} nivel={3}>
                <p className="text-lg text-texto-suave">
                  Tel. {cliente.telefono}
                  {cliente.carnet && ` · Carnet ${cliente.carnet}`}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Boton variante="secundario" tamano="compacto" onClick={() => alElegir(cliente)}>
                    Ver datos
                  </Boton>
                  {conSucursal && (
                    <EnlaceBoton a={enlaceABoletasDe(cliente.id)} variante="secundario" tamano="compacto" icono="historial">
                      Ver sus boletas
                    </EnlaceBoton>
                  )}
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
      <Paginas pagina={pagina} total={total} porPagina={porPagina} irAPagina={irAPagina} nombre="Páginas de clientes" />
    </section>
  );
}
