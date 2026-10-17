import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icono, type NombreIcono } from './iconos';

type Props = {
  /** A dónde lleva, dentro de la app. */
  a: string;
  children: ReactNode;
  variante?: 'primario' | 'secundario';
  icono?: NombreIcono;
};

/**
 * Un enlace con aspecto de botón — SPEC-KRILINXI-024: "Volver al inicio" en la página que no
 * existe, en los avisos de "solo para…".
 *
 * Es un enlace (`<a>`) y no un `Boton` porque lleva a otra pantalla: así el lector de pantalla
 * lo anuncia como enlace, se puede abrir en otra pestaña, y el navegador lo trata como tal. Se
 * VE como botón porque para quien lo usa es "lo que hay que tocar", y un subrayado chico en
 * medio del texto es fácil de pasar por alto.
 */
export function EnlaceBoton({ a, children, variante = 'primario', icono }: Props) {
  const estilo =
    variante === 'primario'
      ? 'border-marca bg-marca text-sobre-marca shadow-sm hover:border-marca-fuerte hover:bg-marca-fuerte'
      : 'border-borde bg-superficie text-texto hover:bg-fondo';
  return (
    <Link
      to={a}
      className={`inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border-2 px-6 py-3 text-xl font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco ${estilo}`}
    >
      {icono && <Icono nombre={icono} />}
      {children}
    </Link>
  );
}
