import type { ReactElement } from 'react';

/**
 * Los íconos de la app — SPEC-KRILINXI-022.
 *
 * Dibujados acá, como SVG en línea, en vez de una librería: son pocos, no pesan nada, y como
 * van dentro del JavaScript abren sin internet y la política de seguridad no tiene nada que
 * permitir. Todos usan `currentColor`, así que toman el color del texto que acompañan.
 *
 * **Un ícono nunca va solo** (CLAUDE.md §9: nada de íconos sueltos que haya que interpretar).
 * Por eso son siempre decorativos (`aria-hidden`): el que dice qué es cada cosa es el texto de
 * al lado, y para un lector de pantalla el ícono no existe.
 *
 * La única excepción es el tema (`sol`, `luna`, SPEC-KRILINXI-030): un botón discreto en la
 * cabecera, sin texto visible. Su nombre va en `aria-label` y en `title` (lo dice al pasar el
 * mouse); el ícono sigue siendo decorativo.
 */
const TRAZOS = {
  inicio: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  'registrar-ropa': (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 14h6M12 11v6" />
    </>
  ),
  ropa: (
    <path d="M20.4 3.5 16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.1a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.3-2.2z" />
  ),
  cobrar: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  entregar: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </>
  ),
  clientes: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    </>
  ),
  personal: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M8 17a4 4 0 0 1 8 0" />
    </>
  ),
  sucursales: (
    <>
      <path d="M4 21V9l8-5 8 5v12" />
      <path d="M9 21v-6h6v6" />
      <path d="M2 21h20" />
    </>
  ),
  'quien-hizo-que': (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  estadisticas: (
    <>
      <path d="M3 3v18h18" />
      <path d="M8 17v-5M13 17V7M18 17v-8" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  salir: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  alerta: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v6M12 17h.01" />
    </>
  ),
  advertencia: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  informacion: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-5M12 8h.01" />
    </>
  ),
  listo: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  luna: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  // SPEC-KRILINXI-037: la flecha de los botones de navegación ("Volver…") y la señal de una
  // tarjeta que se toca (lleva a algo). Las dos van con su texto al lado, como todas.
  volver: <path d="M19 12H5m6-6-6 6 6 6" />,
  seguir: <path d="m9 6 6 6-6 6" />,
} satisfies Record<string, ReactElement>;

export type NombreIcono = keyof typeof TRAZOS;

/** Todos los nombres, para recorrerlos (el test los dibuja uno por uno). */
export const NOMBRES_ICONOS = Object.keys(TRAZOS) as NombreIcono[];

type Props = {
  nombre: NombreIcono;
  /** El tamaño, como clase de Tailwind. Por defecto, el de una línea de texto grande. */
  tamano?: 'size-5' | 'size-6' | 'size-8' | 'size-10';
};

export function Icono({ nombre, tamano = 'size-6' }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`${tamano} shrink-0`}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
