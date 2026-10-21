import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { estiloBoton, type TamanoBoton, type VarianteBoton } from './estilosBoton';
import { Icono, type NombreIcono } from './iconos';

type Props = {
  /** A dónde lleva, dentro de la app. */
  a: string;
  children: ReactNode;
  /** Las mismas de `Boton` (SPEC-KRILINXI-037): `navegacion` para "Volver…" o "Ver…". */
  variante?: Exclude<VarianteBoton, 'peligro'>;
  tamano?: TamanoBoton;
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
export function EnlaceBoton({ a, children, variante = 'primario', tamano = 'normal', icono }: Props) {
  return (
    <Link to={a} className={estiloBoton(variante, tamano, { enlace: true })}>
      {icono && <Icono nombre={icono} />}
      {children}
    </Link>
  );
}
