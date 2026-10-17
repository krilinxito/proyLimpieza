import { useRef, useState, type ReactNode } from 'react';
import { Icono, type NombreIcono } from './iconos';

export type VarianteBoton = 'primario' | 'secundario' | 'peligro';

// Solo colores del tema (SPEC-KRILINXI-022). `enabled:hover:` para que un botón deshabilitado
// no "reaccione" al pasarle el dedo o el mouse, como si se pudiera tocar.
const ESTILO: Record<VarianteBoton, string> = {
  primario: 'border-marca bg-marca text-sobre-marca shadow-sm enabled:hover:border-marca-fuerte enabled:hover:bg-marca-fuerte',
  secundario: 'border-borde bg-superficie text-texto enabled:hover:bg-fondo',
  peligro: 'border-peligro bg-peligro text-sobre-marca shadow-sm enabled:hover:border-peligro-fuerte enabled:hover:bg-peligro-fuerte',
};

/**
 * Lo que comparten las tres variantes — SPEC-KRILINXI-022:
 * - El anillo de foco solo con teclado (`focus-visible`): quien navega con Tab ve dónde está, y
 *   quien toca con el dedo no ve un recuadro naranja que no pidió.
 * - Deshabilitado se distingue por algo más que el color: el borde pasa a punteado y el cursor
 *   dice que no se puede. Un botón apenas más pálido no lo nota todo el mundo.
 */
const BASE =
  'inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border-2 px-6 py-3 text-xl font-semibold transition-colors ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco ' +
  'disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-60 disabled:shadow-none';

type Props = {
  children: ReactNode;
  /**
   * Puede devolver una promesa: el botón se queda ocupado hasta que termine. Los errores
   * los maneja quien pasa la función: el botón solo se vuelve a habilitar.
   */
  onClick?: () => void | Promise<void>;
  variante?: VarianteBoton;
  /** `submit` para el botón que envía un formulario. */
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Ocupado desde fuera, p. ej. mientras un formulario se guarda. */
  ocupado?: boolean;
  /** Lo que dice mientras está ocupado: "Guardando…". Sin él, conserva su texto. */
  textoOcupado?: string;
  /** Para el botón que debe tener el foco al aparecer, como "Cancelar" en un modal. */
  autoFocus?: boolean;
  /** Un ícono antes del texto. Decorativo: el nombre del botón sigue siendo su texto. */
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
      className={`${BASE} ${ESTILO[variante]}`}
    >
      {icono && <Icono nombre={icono} />}
      {estaOcupado && textoOcupado ? textoOcupado : children}
    </button>
  );
}
