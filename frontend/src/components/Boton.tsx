import { useRef, useState, type ReactNode } from 'react';

export type VarianteBoton = 'primario' | 'secundario' | 'peligro';

const ESTILO: Record<VarianteBoton, string> = {
  primario: 'bg-sky-700 text-white',
  secundario: 'border-2 border-slate-400 bg-white text-slate-900',
  peligro: 'bg-red-700 text-white',
};

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
      className={`min-h-14 w-full rounded-lg px-6 py-3 text-xl font-semibold disabled:opacity-60 ${ESTILO[variante]}`}
    >
      {estaOcupado && textoOcupado ? textoOcupado : children}
    </button>
  );
}
