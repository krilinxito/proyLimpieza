import type { ReactElement } from 'react';
import { EnConstruccion } from './EnConstruccion';
import { Inicio } from './Inicio';

export type Ruta = {
  /** La dirección, en el idioma del negocio: /registrar-ropa, no /orders/new. */
  camino: string;
  /** Lo que ve el usuario, también en su idioma (CLAUDE.md §9). */
  titulo: string;
  /** Si aparece como botón en el menú del mostrador. */
  enMenu: boolean;
  elemento: ReactElement;
};

/**
 * El registro de rutas del proyecto, en un solo sitio.
 *
 * Las pantallas que aún no existen ya están montadas con un hueco: así cada spec siguiente
 * solo sustituye su `elemento` en vez de que todas terminen editando este mismo archivo.
 */
export const RUTAS: readonly Ruta[] = [
  { camino: '/', titulo: 'Inicio', enMenu: false, elemento: <Inicio /> },
  {
    camino: '/ingresar',
    titulo: 'Ingresar al sistema',
    enMenu: false,
    elemento: <EnConstruccion titulo="Ingresar al sistema" />,
  },
  {
    camino: '/registrar-ropa',
    titulo: 'Registrar ropa',
    enMenu: true,
    elemento: <EnConstruccion titulo="Registrar ropa" />,
  },
  {
    camino: '/entregar',
    titulo: 'Entregar ropa',
    enMenu: true,
    elemento: <EnConstruccion titulo="Entregar ropa" />,
  },
  { camino: '/cobrar', titulo: 'Cobrar', enMenu: true, elemento: <EnConstruccion titulo="Cobrar" /> },
  {
    camino: '/clientes',
    titulo: 'Clientes',
    enMenu: true,
    elemento: <EnConstruccion titulo="Clientes" />,
  },
  {
    camino: '/estadisticas',
    titulo: 'Estadísticas',
    enMenu: true,
    elemento: <EnConstruccion titulo="Estadísticas" />,
  },
];
