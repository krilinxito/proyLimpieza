import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  /** Dónde se trabaja: "Sucursal Centro", "Administración". Sin sesión, nada. */
  lugar?: string | null;
  /** El botón del menú en pantalla chica. */
  menu?: ReactNode;
  /** Quién atiende y sus acciones (el tema, Dejar de atender y Salir tras el círculo, en un celular). */
  acciones?: ReactNode;
  /** Claro u oscuro (SPEC-KRILINXI-030). Solo sin sesión, en el ingreso; con sesión va dentro de `acciones`. */
  tema?: ReactNode;
  /** La píldora de la conexión (SPEC-KRILINXI-031). Solo con sesión: sin nadie adentro no hay base. */
  conexion?: ReactNode;
};

/**
 * Arriba de todo, en todas las pantallas — SPEC-KRILINXI-023: el nombre del negocio, dónde se
 * está trabajando y quién atiende. Se queda fija al bajar (`sticky`): Salir y el menú están
 * siempre a mano, también al final de una lista larga.
 *
 * Desde SPEC-KRILINXI-066 es de **un solo renglón bajo** en un celular (menos de 640px): el menú, el nombre del negocio con
 * dónde se está en letra pequeña debajo, la conexión y el círculo de quien atiende. El tema, "Dejar de atender" y Salir
 * viven tras ese círculo (`MenuPerfil`). Desde `sm` (640px) todo está a la vista en la misma fila, como siempre. (La
 * SPEC-KRILINXI-054 lo había partido en dos renglones con un corte; ya no hace falta.) El orden del DOM, que es el que
 * recorre el teclado, no cambia entre un tamaño y otro.
 *
 * En un celular, con sesión, el nombre "Lavandería" **se esconde** y queda solo dónde se trabaja ("Administración", "Sucursal Centro"): juntos no
 * cabían y se pisaban. El Inicio sigue a un toque en el menú. Sin sesión (el ingreso) no hay lugar, y el nombre se ve siempre.
 *
 * El nombre del negocio no es un encabezado (`h1`): el `h1` es el de cada pantalla, que es lo
 * que cambia y lo que el lector de pantalla tiene que anunciar.
 */
export function Cabecera({ lugar, menu, acciones, tema, conexion }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-borde-suave bg-superficie shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3 lg:px-6">
        {menu}
        <div className="mr-auto min-w-0 flex-1 sm:flex-none">
          <Link
            to="/"
            className={`${lugar ? 'hidden sm:block' : 'block'} text-lg font-bold text-marca sm:text-2xl focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco`}
          >
            Lavandería
          </Link>
          {lugar && (
            <p className="truncate text-base font-semibold text-texto sm:text-lg sm:font-normal sm:text-texto-suave">{lugar}</p>
          )}
        </div>
        {conexion}
        {tema}
        {acciones}
      </div>
    </header>
  );
}
