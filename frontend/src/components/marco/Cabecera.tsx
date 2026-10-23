import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  /** Dónde se trabaja: "Sucursal Centro", "Administración". Sin sesión, nada. */
  lugar?: string | null;
  /** El botón del menú en pantalla chica. */
  menu?: ReactNode;
  /** Quién atiende y Salir. */
  acciones?: ReactNode;
  /** Claro u oscuro (SPEC-KRILINXI-030). Está también sin sesión: en el ingreso se lee igual. */
  tema?: ReactNode;
  /** La píldora de la conexión (SPEC-KRILINXI-031). Solo con sesión: sin nadie adentro no hay base. */
  conexion?: ReactNode;
};

/**
 * Arriba de todo, en todas las pantallas — SPEC-KRILINXI-023: el nombre del negocio, dónde se
 * está trabajando y quién atiende. Se queda fija al bajar (`sticky`): Salir y el menú están
 * siempre a mano, también al final de una lista larga.
 *
 * Desde SPEC-KRILINXI-054 se acomoda en pantalla chica (celular): arriba el menú, el nombre y dónde se está, el tema y quién
 * atiende; en un segundo renglón, la conexión, "Dejar de atender" y Salir. Desde `sm` (640px) todo vuelve a una sola fila.
 * Se logra con `order` y un corte de renglón (`basis-full`) que solo existe en angosto: el orden del DOM, que es el que
 * recorre el teclado, no cambia.
 *
 * El nombre del negocio no es un encabezado (`h1`): el `h1` es el de cada pantalla, que es lo
 * que cambia y lo que el lector de pantalla tiene que anunciar.
 */
export function Cabecera({ lugar, menu, acciones, tema, conexion }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-borde-suave bg-superficie shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 sm:gap-x-4 lg:px-6">
        {menu}
        <div className="mr-auto min-w-0">
          <Link
            to="/"
            className="text-2xl font-bold text-marca focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
          >
            Lavandería
          </Link>
          {lugar && <p className="truncate text-lg text-texto-suave">{lugar}</p>}
        </div>
        {conexion && <div className="order-5 mr-auto sm:order-none sm:mr-0">{conexion}</div>}
        {tema}
        {/* El corte de renglón: solo en angosto, para que la conexión y Salir queden abajo. */}
        <div aria-hidden="true" className="order-4 basis-full sm:hidden" data-corte-de-renglon />
        {acciones}
      </div>
    </header>
  );
}
