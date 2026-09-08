import { Link } from 'react-router-dom';
import { Pantalla } from './Pantalla';
import { RUTAS } from './rutas';

/** El menú del mostrador. En palabras del negocio, no del sistema (CLAUDE.md §9). */
export function Inicio() {
  return (
    <Pantalla titulo="Lavandería">
      <nav className="mt-6 grid gap-3">
        {RUTAS.filter((r) => r.enMenu).map((ruta) => (
          <Link
            key={ruta.camino}
            to={ruta.camino}
            className="rounded-lg bg-sky-700 px-6 py-4 text-xl font-semibold text-white"
          >
            {ruta.titulo}
          </Link>
        ))}
      </nav>
    </Pantalla>
  );
}
