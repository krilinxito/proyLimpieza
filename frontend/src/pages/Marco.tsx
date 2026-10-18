import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AvisoConexion } from '../components/AvisoConexion';
import { Cabecera } from '../components/marco/Cabecera';
import { BotonTema } from '../components/marco/BotonTema';
import { MenuCompacto } from '../components/marco/MenuCompacto';
import { MenuPrincipal } from '../components/marco/MenuPrincipal';
import { Pie } from '../components/marco/Pie';
import { SaltarAlContenido } from '../components/marco/SaltarAlContenido';
import { DejarDeAtender } from '../features/atencion/components/DejarDeAtender';
import { useSucursalDeTrabajo } from '../features/atencion/hooks/useSucursalDeTrabajo';
import { BarraSesion } from '../features/auth/components/BarraSesion';
import { useSucursales } from '../features/sucursales/hooks/useSucursales';
import { useConexion } from '../hooks/useConexion';
import { useSession } from '../hooks/useSession';
import { useTema } from '../hooks/useTema';
import type { Usuario } from '../features/auth/types';
import { destinosDelMenu, tituloDePestana } from './rutas';
import { VERSION_APP } from './version';

const CONTENIDO = 'contenido';

/** El aviso de conexión con los números de la base local (SPEC-KRILINXI-007). */
function EstadoConexion() {
  const estado = useConexion();
  return estado && <AvisoConexion {...estado} />;
}

/**
 * Dónde está trabajando quien entró: el nombre de su sucursal de trabajo, de la base local. El
 * ADMIN no tiene sucursal (CLAUDE.md §3), salvo mientras atiende en una (SPEC-KRILINXI-029).
 * Mientras la base local no la tiene (la primera vez, antes de que baje), no dice nada: mejor
 * nada que un nombre inventado.
 */
function useLugar(usuario: Usuario | undefined): string | null {
  const sucursales = useSucursales();
  const sucursalId = useSucursalDeTrabajo();
  if (!usuario) return null;
  if (usuario.rol === 'ADMIN' && !sucursalId) return 'Administración';
  const nombre = sucursales?.find((s) => s.id === sucursalId)?.nombre;
  if (!nombre) return null;
  return usuario.rol === 'ADMIN' ? `Atendiendo en ${nombre}` : `Sucursal ${nombre}`;
}

/**
 * El marco de todas las pantallas — SPEC-KRILINXI-023: cabecera, menú, aviso de conexión, el
 * contenido de la ruta (`<Outlet />`) y el pie.
 *
 * Es una ruta de diseño (layout route): `App.tsx` la pone por encima de todas las demás, así que
 * cambiar de pantalla cambia solo el `<Outlet />` y el marco no se vuelve a montar. Junta los
 * datos (sesión, conexión, sucursal, rutas) y se los pasa a las piezas de `components/marco/`,
 * que solo reciben props (CLAUDE.md §5).
 *
 * Sin sesión (/ingresar, una dirección que no existe) queda solo el nombre del negocio: no hay
 * menú al que ir ni nadie que salga.
 */
export function Marco() {
  const { sesion } = useSession();
  const { pathname } = useLocation();
  const usuario = sesion?.usuario;
  const lugar = useLugar(usuario);
  const conSucursal = useSucursalDeTrabajo() !== null;
  const destinos = usuario ? destinosDelMenu(usuario.rol, conSucursal) : [];
  const { tema, cambiar } = useTema();

  useEffect(() => {
    document.title = tituloDePestana(pathname);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <SaltarAlContenido destino={CONTENIDO} />
      <Cabecera
        lugar={lugar}
        menu={usuario && <MenuCompacto destinos={destinos} />}
        tema={<BotonTema tema={tema} alCambiar={cambiar} />}
        acciones={
          usuario && (
            <>
              <DejarDeAtender />
              <BarraSesion />
            </>
          )
        }
      />
      <div className="flex flex-1">
        {usuario && (
          <aside className="hidden w-72 shrink-0 border-r border-borde-suave bg-superficie py-4 pr-3 lg:block">
            <div className="sticky top-24">
              <MenuPrincipal destinos={destinos} />
            </div>
          </aside>
        )}
        <main id={CONTENIDO} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {usuario && (
            <div className="px-4 pt-4 lg:px-6">
              <EstadoConexion />
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <Pie lugar={lugar} version={VERSION_APP} />
    </div>
  );
}
