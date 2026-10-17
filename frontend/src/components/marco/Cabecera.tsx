import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  /** Dónde se trabaja: "Sucursal Centro", "Administración". Sin sesión, nada. */
  lugar?: string | null;
  /** El botón del menú en pantalla chica. */
  menu?: ReactNode;
  /** Quién atiende y Salir. */
  acciones?: ReactNode;
};

/**
 * Arriba de todo, en todas las pantallas — SPEC-KRILINXI-023: el nombre del negocio, dónde se
 * está trabajando y quién atiende. Se queda fija al bajar (`sticky`): Salir y el menú están
 * siempre a mano, también al final de una lista larga.
 *
 * El nombre del negocio no es un encabezado (`h1`): el `h1` es el de cada pantalla, que es lo
 * que cambia y lo que el lector de pantalla tiene que anunciar.
 */
export function Cabecera({ lugar, menu, acciones }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-borde-suave bg-superficie shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
        {menu}
        <div className="mr-auto">
          <Link
            to="/"
            className="text-2xl font-bold text-marca focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
          >
            Lavandería
          </Link>
          {lugar && <p className="text-lg text-texto-suave">{lugar}</p>}
        </div>
        {acciones}
      </div>
    </header>
  );
}
