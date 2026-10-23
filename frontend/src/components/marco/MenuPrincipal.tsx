import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CLAVE_DE_REINICIO } from '../../hooks/useReinicioDeRuta';
import { Icono, type NombreIcono } from '../iconos';

export type DestinoMenu = { camino: string; titulo: string; icono: NombreIcono };

type Props = {
  destinos: readonly DestinoMenu[];
  /** Al elegir un destino. El cajón lo usa para cerrarse; la barra lateral no lo necesita. */
  onElegir?: () => void;
};

/**
 * La lista de destinos — SPEC-KRILINXI-023. La misma en la barra lateral y en el cajón, para
 * que el menú diga lo mismo en todas las pantallas.
 *
 * `NavLink` marca solo el destino actual con `aria-current="page"`: el lector de pantalla dice
 * "página actual", y el estilo se cuelga de ese mismo atributo (`aria-[current=page]:`), así lo
 * que se ve y lo que se anuncia no pueden contradecirse. Lo actual se distingue por algo más que
 * el color: negrita y una barra a la izquierda.
 *
 * Tocar el destino en el que ya se está **vuelve a su inicio** (SPEC-KRILINXI-057): una pantalla que abre vistas
 * adentro, como una boleta en el Mostrador, no cambia de dirección, y antes tocar su nombre no hacía nada. Acá se
 * deja una marca nueva en el estado de la dirección y la pantalla la lee con `useReinicioDeRuta`.
 */
export function MenuPrincipal({ destinos, onElegir }: Props) {
  const { pathname } = useLocation();
  const navegar = useNavigate();
  return (
    <nav aria-label="Menú principal">
      <ul className="grid gap-1">
        {destinos.map((destino) => (
          <li key={destino.camino}>
            <NavLink
              to={destino.camino}
              end
              onClick={(evento) => {
                if (pathname === destino.camino) {
                  // Ya se está ahí: no es una navegación nueva, es "volver al principio de esta pantalla".
                  evento.preventDefault();
                  navegar(destino.camino, { replace: true, state: { [CLAVE_DE_REINICIO]: Date.now() } });
                }
                onElegir?.();
              }}
              className="flex min-h-14 items-center gap-3 rounded-r-xl border-l-4 border-transparent px-4 text-xl text-texto transition-colors hover:bg-fondo focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-foco aria-[current=page]:border-marca aria-[current=page]:bg-marca-suave aria-[current=page]:font-bold aria-[current=page]:text-marca-fuerte"
            >
              <Icono nombre={destino.icono} />
              <span>{destino.titulo}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
