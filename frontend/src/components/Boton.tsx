import { useRef, useState, type ReactNode } from 'react';
import { estiloBoton, type TamanoBoton, type VarianteBoton } from './estilosBoton';
import { Icono, type NombreIcono } from './iconos';

export type { TamanoBoton, VarianteBoton } from './estilosBoton';

/**
 * El ícono que lleva una variante si no se le da otro (SPEC-KRILINXI-037): lo que no tiene vuelta
 * atrás se reconoce también por la forma, no solo por el rojo, y volver lleva su flecha.
 */
const ICONO_DE: Partial<Record<VarianteBoton, NombreIcono>> = { peligro: 'alerta', navegacion: 'volver' };

/**
 * Lo propio de un botón, encima de su variante (`estilosBoton.ts`) — SPEC-KRILINXI-022: deshabilitado
 * se distingue por algo más que el color, el borde pasa a punteado y el cursor dice que no se puede.
 * Un botón apenas más pálido no lo nota todo el mundo.
 */
const DESHABILITADO = 'disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-60 disabled:shadow-none';

type Props = {
  children: ReactNode;
  /**
   * Puede devolver una promesa: el botón se queda ocupado hasta que termine. Los errores
   * los maneja quien pasa la función: el botón solo se vuelve a habilitar.
   */
  onClick?: () => void | Promise<void>;
  /** Qué peso tiene (SPEC-KRILINXI-037): `primario` uno solo por pantalla; ver `components/README.md`. */
  variante?: VarianteBoton;
  /** `compacto` en una fila de acciones secundarias. */
  tamano?: TamanoBoton;
  /** `submit` para el botón que envía un formulario. */
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Ocupado desde fuera, p. ej. mientras un formulario se guarda. */
  ocupado?: boolean;
  /** Lo que dice mientras está ocupado: "Guardando…". Sin él, conserva su texto. */
  textoOcupado?: string;
  /** Para el botón que debe tener el foco al aparecer, como "Cancelar" en un modal. */
  autoFocus?: boolean;
  /**
   * Un ícono antes del texto. Decorativo: el nombre del botón sigue siendo su texto. El de peligro
   * lleva siempre uno (el de alerta si no se le da otro), y el de navegación, la flecha de volver.
   */
  icono?: NombreIcono;
};

/**
 * El botón del mostrador: texto grande y al menos 56px de alto, porque se usa de pie, con
 * prisa y a veces con el dedo de una persona mayor (CLAUDE.md §9).
 *
 * Se deshabilita solo mientras su acción está en curso. Sin eso, un doble toque en "Cobrar"
 * registra dos pagos.
 */
export function Boton({
  children,
  onClick,
  variante = 'primario',
  tamano = 'normal',
  type = 'button',
  disabled = false,
  ocupado = false,
  textoOcupado,
  autoFocus = false,
  icono,
}: Props) {
  const [trabajando, setTrabajando] = useState(false);
  // El estado de React tarda un render en llegar al DOM; la ref cambia en el acto. Con las
  // dos, un segundo toque que entre antes del re-render también se descarta.
  const enCurso = useRef(false);

  const estaOcupado = ocupado || trabajando;
  const elIcono = icono ?? ICONO_DE[variante];

  async function manejarClick() {
    if (!onClick || enCurso.current) return;
    enCurso.current = true;
    setTrabajando(true);
    try {
      await onClick();
    } finally {
      enCurso.current = false;
      setTrabajando(false);
    }
  }

  return (
    <button
      type={type}
      onClick={onClick ? manejarClick : undefined}
      disabled={disabled || estaOcupado}
      aria-busy={estaOcupado}
      autoFocus={autoFocus}
      className={`${estiloBoton(variante, tamano)} ${DESHABILITADO}`}
    >
      {elIcono && <Icono nombre={elIcono} />}
      {estaOcupado && textoOcupado ? textoOcupado : children}
    </button>
  );
}
