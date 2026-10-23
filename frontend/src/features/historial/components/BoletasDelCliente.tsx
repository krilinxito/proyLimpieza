import { useNavigate, useSearchParams } from 'react-router-dom';
import { Aviso } from '../../../components/Aviso';
import { BotonAtras } from '../../../components/BotonAtras';
import { Paginas } from '../../../components/Paginas';
import { useBoletasDelCliente } from '../hooks/useBoletasDelCliente';
import { FilaDeBoleta } from './FilaDeBoleta';

/** El parámetro de la dirección que dice de qué cliente son las boletas: `/clientes/boletas?cliente=…`. */
export const PARAMETRO_CLIENTE = 'cliente';

/** La dirección de las boletas de un cliente — SPEC-KRILINXI-061. */
export function enlaceABoletasDe(clienteId: string): string {
  return `/clientes/boletas?${new URLSearchParams({ [PARAMETRO_CLIENTE]: clienteId }).toString()}`;
}

/**
 * Todas las boletas de un cliente en la sucursal de trabajo — SPEC-KRILINXI-061. De la base local, también
 * sin internet, paginadas del tamaño de la pantalla; cada una lleva al Mostrador, donde se cobra o se entrega.
 */
export function BoletasDelCliente() {
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const clienteId = parametros.get(PARAMETRO_CLIENTE) ?? '';
  const { cliente, leido, boletas, total, porPagina, pagina, irAPagina } = useBoletasDelCliente(clienteId);

  return (
    <>
      <BotonAtras nombre="Volver a Clientes" alTocar={() => navegar('/clientes')} />
      {!leido || boletas === null ? (
        <p className="mt-6 text-xl text-texto-suave">Buscando…</p>
      ) : !cliente ? (
        <div className="mt-6">
          <Aviso tipo="advertencia">No encontramos a ese cliente. Vuelve a Clientes y búscalo de nuevo.</Aviso>
        </div>
      ) : (
        <section aria-label="Las boletas" className="mt-6">
          <h2 className="text-2xl font-bold text-texto">Boletas de {cliente.nombre}</h2>
          {total === 0 ? (
            <p className="mt-4 text-xl text-texto-suave">Este cliente todavía no dejó ropa en esta sucursal.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {boletas.map((boleta) => (
                <li key={boleta.id}>
                  <FilaDeBoleta boleta={boleta} destino={{ tipo: 'mostrador' }} />
                </li>
              ))}
            </ul>
          )}
          <Paginas pagina={pagina} total={total} porPagina={porPagina} irAPagina={irAPagina} nombre="Páginas de boletas" />
        </section>
      )}
    </>
  );
}
