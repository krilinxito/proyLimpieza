import { useCallback, useEffect, useState } from 'react';
import { Boton } from '../../../components/Boton';
import { Paginas } from '../../../components/Paginas';
import { usePaginado } from '../../../hooks/usePaginado';
import { TarjetaCliente } from '../../clientes/components/TarjetaCliente';
import type { Cliente } from '../../clientes/types';
import { AccionEntregar } from '../../entregas/components/AccionEntregar';
import { ResumenEntrega } from '../../entregas/components/ResumenEntrega';
import type { EntregaLista } from '../../entregas/types';
import { DetalleOrden } from '../../ordenes/components/DetalleOrden';
import { TarjetaOrden } from '../../ordenes/components/TarjetaOrden';
import type { OrdenVista } from '../../ordenes/types';
import { useMostrador } from '../hooks/useMostrador';

type Props = {
  clienteId: string;
  /** La boleta abierta dentro de la ficha, o null para ver toda su ropa. */
  abierta: string | null;
  alAbrir: (ordenId: string | null) => void;
  /** Abre Registrar ropa con este cliente ya elegido (SPEC-KRILINXI-057). */
  alRegistrar: () => void;
};

/**
 * La ficha de un cliente en el Mostrador — SPEC-KRILINXI-033: sus datos y su ropa en esta
 * sucursal, y dentro de ella, la boleta que se esté atendiendo con lo que se puede hacer según su
 * estado. Es el detalle de siempre (`DetalleOrden`, SPEC-KRILINXI-008) con "Entregar la ropa"
 * (SPEC-KRILINXI-009): las mismas reglas y las mismas confirmaciones, ahora en un solo lugar.
 *
 * Después de entregar muestra el resumen de la entrega; al volver, la ropa del cliente ya figura
 * entregada, sin tener que buscarla de nuevo.
 */
export function FichaCliente({ clienteId, abierta, alAbrir, alRegistrar }: Props) {
  const mostrador = useMostrador();
  const [cliente, setCliente] = useState<Cliente | null | undefined>(undefined);
  const [ropa, setRopa] = useState<OrdenVista[] | null>(null);
  const [entregada, setEntregada] = useState<EntregaLista | null>(null);
  const paginas = usePaginado(ropa);

  const recargar = useCallback(async () => {
    if (!mostrador.lista) return;
    const [elCliente, suRopa] = await Promise.all([mostrador.cliente(clienteId), mostrador.ropaDe(clienteId)]);
    setCliente(elCliente);
    setRopa(suRopa);
  }, [mostrador, clienteId]);

  useEffect(() => {
    recargar().catch((error: unknown) => console.error('No se pudo leer la ficha del cliente.', error));
    // Al cerrar una boleta también se relee: pudo haber avanzado, cobrado o anulado.
  }, [recargar, abierta]);

  if (cliente === undefined) return <p className="mt-6 text-xl text-texto-suave">Buscando…</p>;
  const nombre = cliente?.nombre ?? 'este cliente';

  if (entregada) {
    return (
      <ResumenEntrega
        entrega={entregada}
        alEntregarOtra={() => {
          setEntregada(null);
          alAbrir(null);
        }}
      />
    );
  }

  return (
    <section aria-label={`Ficha de ${nombre}`} className="mt-6">
      {cliente && <TarjetaCliente cliente={cliente} titulo="Cliente" />}

      {abierta ? (
        <>
          <DetalleOrden
            key={abierta}
            ordenId={abierta}
            alVolver={() => alAbrir(null)}
            textoVolver={`Ver toda la ropa de ${nombre}`}
            accionesExtra={(orden, _recargar, { principal }) => (
              <AccionEntregar
                orden={orden}
                principal={principal}
                alEntregar={(entrega) => {
                  setEntregada(entrega);
                  // Se relee ya, mientras se muestra el resumen: al volver, la lista del cliente tiene
                  // que decir Entregado desde el primer instante, no la ropa como estaba antes.
                  recargar().catch((error: unknown) => console.error('No se pudo leer la ficha del cliente.', error));
                }}
              />
            )}
          />
          {/* Otra boleta del mismo cliente, sin volver a buscarlo (SPEC-KRILINXI-057). Secundaria y fuera de la fila de
            acciones de la boleta: la principal sigue siendo una sola (SPEC-KRILINXI-037) y la fila no pasa de cuatro (049). */}
          <div className="mt-6">
            <Boton variante="secundario" icono="registrar-ropa" onClick={alRegistrar}>
              Nueva boleta de este cliente
            </Boton>
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-8 text-2xl font-bold text-texto">Su ropa en esta sucursal</h2>
          {ropa === null && <p className="mt-4 text-xl text-texto-suave">Buscando…</p>}
          {ropa?.length === 0 && <p className="mt-4 text-xl text-texto-suave">No dejó ropa en esta sucursal.</p>}
          {paginas.visibles && paginas.visibles.length > 0 && (
            <ul className="mt-4 grid gap-3">
              {paginas.visibles.map((orden) => (
                <li key={orden.id}>
                  <TarjetaOrden orden={orden} alElegir={() => alAbrir(orden.id)} />
                </li>
              ))}
            </ul>
          )}
          <Paginas
            pagina={paginas.pagina}
            total={paginas.total}
            porPagina={paginas.porPagina}
            irAPagina={paginas.irAPagina}
            nombre="Páginas de la ropa del cliente"
          />
        </>
      )}
    </section>
  );
}
