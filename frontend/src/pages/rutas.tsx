import type { ReactElement } from 'react';
import { FormularioIngreso } from '../features/auth/components/FormularioIngreso';
import { AvisoSoloEmpleado } from '../features/auth/components/AvisoSoloEmpleado';
import { PantallaClientes } from '../features/clientes/components/PantallaClientes';
import { PantallaEntregar } from '../features/entregas/components/PantallaEntregar';
import { PantallaRegistrarRopa } from '../features/ordenes/components/PantallaRegistrarRopa';
import { PantallaRopa } from '../features/ordenes/components/PantallaRopa';
import { PantallaParaCorregir } from '../features/pendientes/components/PantallaParaCorregir';
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
  /** Lo que ve quien entró pero no tiene el rol. Si no se dice, el aviso de "solo administrador". */
  sinPermiso?: ReactElement;
};

const TODOS = ROLES;
const SOLO_ADMIN: readonly Rol[] = ['ADMIN'];
// El mostrador registra en una sucursal, y el ADMIN no tiene ninguna (CLAUDE.md §3).
const SOLO_EMPLEADO: readonly Rol[] = ['EMPLEADO'];

/** Lo que ve el ADMIN en una pantalla del mostrador. */
function soloEmpleado(titulo: string): ReactElement {
  return (
    <Pantalla titulo={titulo}>
      <AvisoSoloEmpleado />
    </Pantalla>
  );
}

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
    acceso: SOLO_EMPLEADO,
    elemento: (
      <Pantalla titulo="Registrar ropa">
        <PantallaRegistrarRopa />
      </Pantalla>
    ),
    sinPermiso: soloEmpleado('Registrar ropa'),
  },
  {
    camino: '/ropa',
    titulo: 'Ropa en el local',
    enMenu: true,
    acceso: SOLO_EMPLEADO,
    elemento: (
      <Pantalla titulo="Ropa en el local">
        <PantallaRopa />
      </Pantalla>
    ),
    sinPermiso: soloEmpleado('Ropa en el local'),
  },
  {
    camino: '/entregar',
    titulo: 'Entregar ropa',
    enMenu: true,
    acceso: SOLO_EMPLEADO,
    elemento: (
      <Pantalla titulo="Entregar ropa">
        <PantallaEntregar />
      </Pantalla>
    ),
    sinPermiso: soloEmpleado('Entregar ropa'),
  },
  {
    camino: '/cobrar',
    titulo: 'Cobrar',
    enMenu: true,
    acceso: SOLO_EMPLEADO,
    // La misma pantalla que /ropa: para cobrar, primero se busca la boleta (SPEC-KRILINXI-008).
    elemento: (
      <Pantalla titulo="Cobrar">
        <PantallaRopa />
      </Pantalla>
    ),
    sinPermiso: soloEmpleado('Cobrar'),
  },
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
    // Sin botón en el menú: se llega desde el aviso de conexión, cuando hay algo que revisar.
    camino: '/para-corregir',
    titulo: 'Registros para corregir',
    enMenu: false,
    acceso: TODOS,
    elemento: (
      <Pantalla titulo="Registros para corregir">
        <PantallaParaCorregir />
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
