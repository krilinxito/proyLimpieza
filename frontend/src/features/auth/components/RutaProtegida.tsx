import type { ReactElement, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../../hooks/useSession';
import type { Rol } from '../../../lib/dominio';

type Props = {
  /** Quién puede ver esta pantalla. */
  roles: readonly Rol[];
  /** Lo que ve alguien con sesión pero sin el rol. */
  sinPermiso: ReactElement;
  children: ReactNode;
};

/**
 * Portero de las pantallas del negocio.
 *
 * Sin sesión, manda a /ingresar y recuerda a dónde se quería ir. Con sesión pero sin el rol,
 * muestra `sinPermiso`. Es comodidad, no seguridad: quien de verdad dice que no es el
 * backend (CLAUDE.md §8). Esto solo evita que un empleado choque con errores del servidor.
 */
export function RutaProtegida({ roles, sinPermiso, children }: Props) {
  const { sesion } = useSession();
  const { pathname, search } = useLocation();

  if (!sesion) return <Navigate to="/ingresar" replace state={{ desde: pathname + search }} />;
  if (!roles.includes(sesion.usuario.rol)) return sinPermiso;
  return children;
}
