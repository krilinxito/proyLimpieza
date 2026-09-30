import { Link } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { Pantalla } from './Pantalla';
import { puedeVer, RUTAS } from './rutas';

/**
 * El menú del mostrador. En palabras del negocio, no del sistema (CLAUDE.md §9).
 * Cada uno ve solo lo que puede abrir: Estadísticas no le aparece a un empleado.
 */
export function Inicio() {
  const { sesion } = useSession();
  const rol = sesion?.usuario.rol;

  return (
    <Pantalla titulo="Lavandería">
      <nav className="mt-6 grid gap-3">
        {RUTAS.filter((r) => r.enMenu && rol !== undefined && puedeVer(r, rol)).map((ruta) => (
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
