/**
 * El aspecto de lo que se toca: lo comparten `Boton` (una acción) y `EnlaceBoton` (lleva a otra
 * pantalla), así un "Volver…" se ve igual sea uno u otro — SPEC-KRILINXI-037.
 *
 * Cuatro usos, que se distinguen por la forma y el peso, no solo por el color (quien no distingue
 * bien los colores también tiene que saber cuál es cuál):
 *  - `primario`: lleno, con sombra. Lo que hay que hacer ahora; uno solo por pantalla.
 *  - `secundario`: con borde, sobre la superficie. Otra acción posible, que no es la principal.
 *  - `peligro`: lleno de rojo y siempre con el ícono de alerta. Lo que no tiene vuelta atrás.
 *  - `navegacion`: sin caja, subrayado, como un enlace. Volver o cambiar de vista: no hace nada,
 *    solo lleva a otro lado.
 *
 * Solo colores del tema (SPEC-KRILINXI-022). Las clases van escritas enteras, nunca armadas con
 * `replace`: Tailwind solo genera las que encuentra literalmente en el código.
 */
export type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'navegacion';

/** `compacto` para una fila de acciones (cobrar, anular): sigue siendo de dedo, 48px de alto. */
export type TamanoBoton = 'normal' | 'compacto';

const COLOR: Record<VarianteBoton, string> = {
  primario: 'border-marca bg-marca text-sobre-marca shadow-sm',
  secundario: 'border-borde bg-superficie text-texto',
  peligro: 'border-peligro bg-peligro text-sobre-marca shadow-sm',
  navegacion: 'border-transparent bg-transparent text-marca underline decoration-2 underline-offset-4',
};

/**
 * Al pasar por encima. En un botón con `enabled:`, para que uno deshabilitado no "reaccione" al
 * dedo o al mouse como si se pudiera tocar; un enlace no se deshabilita, y `:enabled` no lo alcanza.
 */
const HOVER_BOTON: Record<VarianteBoton, string> = {
  primario: 'enabled:hover:border-marca-fuerte enabled:hover:bg-marca-fuerte',
  secundario: 'enabled:hover:bg-fondo',
  peligro: 'enabled:hover:border-peligro-fuerte enabled:hover:bg-peligro-fuerte',
  navegacion: 'enabled:hover:decoration-4',
};

const HOVER_ENLACE: Record<VarianteBoton, string> = {
  primario: 'hover:border-marca-fuerte hover:bg-marca-fuerte',
  secundario: 'hover:bg-fondo',
  peligro: 'hover:border-peligro-fuerte hover:bg-peligro-fuerte',
  navegacion: 'hover:decoration-4',
};

/** La navegación no tiene caja que rellenar: casi sin relleno al costado, alineada con el texto. */
const TAMANO: Record<TamanoBoton, { caja: string; suelto: string }> = {
  normal: { caja: 'min-h-14 gap-3 px-6 py-3 text-xl', suelto: 'min-h-14 gap-3 px-1 py-3 text-xl' },
  compacto: { caja: 'min-h-12 gap-2 px-4 py-2 text-lg', suelto: 'min-h-12 gap-2 px-1 py-2 text-lg' },
};

/**
 * Lo que comparten todos — SPEC-KRILINXI-022: el anillo de foco solo con teclado (`focus-visible`),
 * así quien navega con Tab ve dónde está y quien toca con el dedo no ve un recuadro que no pidió.
 */
const BASE =
  'inline-flex items-center justify-center rounded-xl border-2 font-semibold transition-colors ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco';

/**
 * Las clases de un botón o enlace con esa variante y ese tamaño. Ocupa todo el ancho solo el botón
 * de tamaño normal que no es de navegación: un "Volver" a todo el ancho parecería la acción
 * principal. Un enlace toma el ancho de su texto, como siempre (SPEC-KRILINXI-024).
 */
export function estiloBoton(variante: VarianteBoton, tamano: TamanoBoton, { enlace = false } = {}): string {
  const navegacion = variante === 'navegacion';
  const medidas = navegacion ? TAMANO[tamano].suelto : TAMANO[tamano].caja;
  const ancho = tamano === 'normal' && !navegacion && !enlace ? 'w-full' : 'w-auto';
  const hover = enlace ? HOVER_ENLACE[variante] : HOVER_BOTON[variante];
  return `${BASE} ${medidas} ${ancho} ${COLOR[variante]} ${hover}`;
}
