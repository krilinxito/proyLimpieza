import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { PantallaAuditoria } from '../features/auditoria/components/PantallaAuditoria';
import { PantallaIngreso } from '../features/auth/components/PantallaIngreso';
import { ConSucursalDeTrabajo } from '../features/atencion/components/ConSucursalDeTrabajo';
import { PantallaClientes } from '../features/clientes/components/PantallaClientes';
import { PantallaMostrador } from '../features/mostrador/components/PantallaMostrador';
import { PantallaEstadisticas } from '../features/estadisticas/components/PantallaEstadisticas';
import { PantallaRegistrarRopa } from '../features/ordenes/components/PantallaRegistrarRopa';
import { PantallaParaCorregir } from '../features/pendientes/components/PantallaParaCorregir';
import { PantallaSucursales } from '../features/sucursales/components/PantallaSucursales';
import { PantallaPersonal } from '../features/usuarios/components/PantallaPersonal';
import type { NombreIcono } from '../components/iconos';
import { ROLES, type Rol } from '../lib/dominio';
import { Inicio } from './Inicio';
import { Pantalla } from './Pantalla';

export type Ruta = {
  /** La dirección, en el idioma del negocio: /registrar-ropa, no /orders/new. */
  camino: string;
  /** Lo que ve el usuario, también en su idioma (CLAUDE.md §9). */
  titulo: string;
  /** Si aparece en el menú (y como botón en el Inicio). */
  enMenu: boolean;
  /**
   * El ícono que la acompaña en el menú y en el Inicio (SPEC-KRILINXI-023). Obligatorio para
   * las rutas del menú: lo comprueba `rutas.test.ts`.
   */
  icono?: NombreIcono;
  /**
   * Para qué sirve, en una línea y en palabras del mostrador: "Cuando el cliente deja ropa…".
   * La muestra el Inicio debajo del nombre (SPEC-KRILINXI-023, la usa la spec del Inicio).
   */
  descripcion?: string;
  /**
   * Quién puede abrirla. `'publica'` no pide sesión (solo /ingresar); el resto exige haber
   * entrado y tener uno de esos roles. Ver RutaProtegida.
   */
  acceso: 'publica' | readonly Rol[];
  elemento: ReactElement;
  /** Lo que ve quien entró pero no tiene el rol. Si no se dice, el aviso de "solo administrador". */
  sinPermiso?: ReactElement;
  /**
   * Una pantalla del mostrador: trabaja sobre una sucursal (SPEC-KRILINXI-029). La pueden abrir
   * todos, pero el menú y el Inicio solo la listan si quien está adentro tiene sucursal de
   * trabajo (un EMPLEADO siempre; un ADMIN, mientras atiende).
   */
  mostrador?: true;
};

const TODOS = ROLES;
const SOLO_ADMIN: readonly Rol[] = ['ADMIN'];

/**
 * Una pantalla del mostrador — SPEC-KRILINXI-029. Lo que se registra ahí va a una sucursal
 * (CLAUDE.md §3): sin sucursal de trabajo (un ADMIN que no está atendiendo) dice cómo empezar.
 */
function delMostrador(titulo: string, contenido: ReactElement): ReactElement {
  return (
    <Pantalla titulo={titulo}>
      <ConSucursalDeTrabajo>{contenido}</ConSucursalDeTrabajo>
    </Pantalla>
  );
}

/**
 * Una dirección que ya no es una pantalla propia: Ropa en el local, Cobrar y Entregar ropa son
 * parte del Mostrador desde SPEC-KRILINXI-033. Lleva ahí, así no se rompe un enlace guardado ni el
 * "volver a donde iba" del ingreso.
 */
function haciaElMostrador(camino: string): Ruta {
  return { camino, titulo: 'Mostrador', enMenu: false, acceso: TODOS, elemento: <Navigate to="/mostrador" replace /> };
}

/**
 * El registro de rutas del proyecto, en un solo sitio.
 *
 * Las pantallas que aún no existen ya están montadas con un hueco: así cada spec siguiente
 * solo sustituye su `elemento` en vez de que todas terminen editando este mismo archivo.
 */
export const RUTAS: readonly Ruta[] = [
  {
    camino: '/',
    titulo: 'Inicio',
    // Fuera de `enMenu`: el Inicio no se lista a sí mismo como botón. El menú lo pone primero.
    enMenu: false,
    icono: 'inicio',
    descripcion: 'Todas las tareas, en un solo lugar.',
    acceso: TODOS,
    elemento: <Inicio />,
  },
  {
    camino: '/ingresar',
    titulo: 'Ingresar al sistema',
    enMenu: false,
    acceso: 'publica',
    // Su propia pantalla, con el título dentro de la tarjeta (SPEC-KRILINXI-024).
    elemento: <PantallaIngreso />,
  },
  {
    camino: '/mostrador',
    titulo: 'Mostrador',
    enMenu: true,
    icono: 'ropa',
    descripcion: 'Buscar al cliente o la boleta para cobrar, entregar o ver cómo va.',
    acceso: TODOS,
    mostrador: true,
    // Ropa en el local, Cobrar y Entregar ropa en una sola pantalla (SPEC-KRILINXI-033).
    elemento: delMostrador('Mostrador', <PantallaMostrador />),
  },
  {
    camino: '/registrar-ropa',
    titulo: 'Registrar ropa',
    enMenu: true,
    icono: 'registrar-ropa',
    descripcion: 'Cuando el cliente deja ropa: se anota y se le da la boleta.',
    acceso: TODOS,
    mostrador: true,
    elemento: delMostrador('Registrar ropa', <PantallaRegistrarRopa />),
  },
  // Las direcciones viejas del mostrador llevan al Mostrador (SPEC-KRILINXI-033).
  ...['/ropa', '/cobrar', '/entregar'].map(haciaElMostrador),
  {
    camino: '/clientes',
    titulo: 'Clientes',
    enMenu: true,
    icono: 'clientes',
    descripcion: 'Buscar un cliente por su teléfono, o anotar uno nuevo.',
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
    camino: '/personal',
    titulo: 'Personal',
    enMenu: true,
    icono: 'personal',
    descripcion: 'Las cuentas de quienes atienden: altas, cambios y bajas.',
    acceso: SOLO_ADMIN,
    elemento: (
      <Pantalla titulo="Personal">
        <PantallaPersonal />
      </Pantalla>
    ),
  },
  {
    camino: '/sucursales',
    titulo: 'Sucursales',
    enMenu: true,
    icono: 'sucursales',
    descripcion: 'Las tiendas: abrir una nueva, cambiarle el nombre o cerrarla.',
    acceso: SOLO_ADMIN,
    elemento: (
      <Pantalla titulo="Sucursales">
        <PantallaSucursales />
      </Pantalla>
    ),
  },
  {
    camino: '/quien-hizo-que',
    titulo: '¿Quién hizo qué?',
    enMenu: true,
    icono: 'quien-hizo-que',
    descripcion: 'Lo que hizo cada persona, día por día.',
    acceso: SOLO_ADMIN,
    elemento: (
      <Pantalla titulo="¿Quién hizo qué?">
        <PantallaAuditoria />
      </Pantalla>
    ),
  },
  {
    camino: '/estadisticas',
    titulo: 'Estadísticas',
    enMenu: true,
    icono: 'estadisticas',
    descripcion: 'Cuánto se cobró, cuánto falta cobrar y cuánta ropa entra.',
    acceso: SOLO_ADMIN,
    elemento: (
      <Pantalla titulo="Estadísticas">
        <PantallaEstadisticas />
      </Pantalla>
    ),
  },
];

/** Si alguien con ese rol puede abrir la ruta. */
export function puedeVer(ruta: Ruta, rol: Rol): boolean {
  return ruta.acceso === 'publica' || ruta.acceso.includes(rol);
}

/** Un destino del menú: lo que necesitan el menú y el Inicio, sin la pantalla. */
export type Destino = { camino: string; titulo: string; icono: NombreIcono; descripcion: string };

function aDestino(ruta: Ruta): Destino[] {
  // Una ruta del menú sin ícono o sin descripción es un error que `rutas.test.ts` caza; acá
  // simplemente no se lista, en vez de romper la pantalla de quien está atendiendo.
  if (!ruta.icono || !ruta.descripcion) return [];
  return [{ camino: ruta.camino, titulo: ruta.titulo, icono: ruta.icono, descripcion: ruta.descripcion }];
}

/**
 * Lo que lista el menú para un rol — SPEC-KRILINXI-023: el Inicio primero, y después lo que
 * está en el menú y ese rol puede abrir, en el orden del registro.
 *
 * Las del mostrador, solo con sucursal de trabajo (SPEC-KRILINXI-029): un ADMIN que no está
 * atendiendo no ve tareas que no puede hacer.
 */
export function destinosDelMenu(rol: Rol, conSucursal: boolean): Destino[] {
  const inicio = RUTAS.filter((r) => r.camino === '/');
  const delMenu = RUTAS.filter((r) => r.enMenu && puedeVer(r, rol) && (conSucursal || !r.mostrador));
  return [...inicio, ...delMenu].flatMap(aDestino);
}

const NEGOCIO = 'Lavandería';

/**
 * El título de la pestaña (y de la app en la lista de abiertas) — SPEC-KRILINXI-023. Un lector
 * de pantalla lo anuncia al cambiar de pantalla. En el Inicio, solo el nombre del negocio.
 */
export function tituloDePestana(camino: string): string {
  if (camino === '/') return NEGOCIO;
  const ruta = RUTAS.find((r) => r.camino === camino);
  return `${ruta?.titulo ?? 'Esa página no existe'} · ${NEGOCIO}`;
}
