import type { ReactElement } from 'react';
import { FormularioIngreso } from '../features/auth/components/FormularioIngreso';
import { PantallaClientes } from '../features/clientes/components/PantallaClientes';
import { ROLES, type Rol } from '../lib/dominio';
import { EnConstruccion } from './EnConstruccion';
import { Inicio } from './Inicio';
import { Pantalla } from './Pantalla';

export type Ruta = {
  /** La dirección, en el idioma del negocio: /registrar-ropa, no /orders/new. */
  camino: string;
  /** Lo que ve el usuario, también en su idioma (CLAUDE.md §9). */
  titulo: string;
  /** Si aparece como botón en el menú del mostrador. */
  enMenu: boolean;
  /**
   * Quién puede abrirla. `'publica'` no pide sesión (solo /ingresar); el resto exige haber
   * entrado y tener uno de esos roles. Ver RutaProtegida.
   */
  acceso: 'publica' | readonly Rol[];
  elemento: ReactElement;
};

const TODOS = ROLES;
const SOLO_ADMIN: readonly Rol[] = ['ADMIN'];

/**
 * El registro de rutas del proyecto, en un solo sitio.
 *
 * Las pantallas que aún no existen ya están montadas con un hueco: así cada spec siguiente
 * solo sustituye su `elemento` en vez de que todas terminen editando este mismo archivo.
 */
export const RUTAS: readonly Ruta[] = [
  { camino: '/', titulo: 'Inicio', enMenu: false, acceso: TODOS, elemento: <Inicio /> },
  {
    camino: '/ingresar',
    titulo: 'Ingresar al sistema',
    enMenu: false,
    acceso: 'publica',
    elemento: (
      <Pantalla titulo="Ingresar al sistema">
        <FormularioIngreso />
      </Pantalla>
    ),
  },
  {
    camino: '/registrar-ropa',
    titulo: 'Registrar ropa',
    enMenu: true,
    acceso: TODOS,
    elemento: <EnConstruccion titulo="Registrar ropa" />,
  },
  {
    camino: '/entregar',
    titulo: 'Entregar ropa',
    enMenu: true,
    acceso: TODOS,
    elemento: <EnConstruccion titulo="Entregar ropa" />,
  },
  { camino: '/cobrar', titulo: 'Cobrar', enMenu: true, acceso: TODOS, elemento: <EnConstruccion titulo="Cobrar" /> },
  {
    camino: '/clientes',
    titulo: 'Clientes',
    enMenu: true,
    acceso: TODOS,
    elemento: (
      <Pantalla titulo="Clientes">
        <PantallaClientes />
      </Pantalla>
    ),
  },
  {
    camino: '/estadisticas',
    titulo: 'Estadísticas',
    enMenu: true,
    acceso: SOLO_ADMIN,
    elemento: <EnConstruccion titulo="Estadísticas" />,
  },
];

/** Si alguien con ese rol puede abrir la ruta. */
export function puedeVer(ruta: Ruta, rol: Rol): boolean {
  return ruta.acceso === 'publica' || ruta.acceso.includes(rol);
}
