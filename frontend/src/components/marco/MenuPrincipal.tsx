import { NavLink } from 'react-router-dom';
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
 */
export function MenuPrincipal({ destinos, onElegir }: Props) {
  return (
    <nav aria-label="Menú principal">
      <ul className="grid gap-1">
        {destinos.map((destino) => (
          <li key={destino.camino}>
            <NavLink
              to={destino.camino}
              end
              onClick={onElegir}
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
