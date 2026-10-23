import { useId, type ReactNode } from 'react';
import { Icono } from './iconos';

/**
 * Los tres tipos de tarjeta — SPEC-KRILINXI-037. Antes eran todas el mismo recuadro blanco, y no
 * se veía qué se podía tocar:
 *  - `informa` (la de siempre): agrupa datos. Liviana, sin sombra, con el borde apenas marcado.
 *  - `destaca`: un número que importa ("Cobrado hoy"). Sobre el color suave de la marca, con el
 *    borde de la marca completo (SPEC-KRILINXI-052: antes una franja gruesa a la izquierda).
 *  - `toca`: entera tocable, lleva a algo. Borde firme (el de los campos), sombra, y la flecha de
 *    `SenalTocable` a la derecha. No la arma este componente: un botón o un enlace no pueden llevar
 *    una `<section>` adentro, así que usan `ESTILO_TARJETA.toca` (`TarjetaOrden`, `FilaBoleta`).
 */
export type TipoTarjeta = 'informa' | 'destaca' | 'toca';

export const ESTILO_TARJETA: Record<TipoTarjeta, string> = {
  informa: 'rounded-2xl border border-borde-suave bg-superficie p-5',
  destaca: 'rounded-2xl border-2 border-marca bg-marca-suave p-5',
  toca:
    'rounded-2xl border-2 border-borde bg-superficie p-4 shadow-md transition-colors hover:border-marca ' +
    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco',
};

/**
 * La señal de que una tarjeta lleva a algo: una flecha a la derecha, como en el resto de las apps.
 * Va al lado del texto de la tarjeta, que es lo que la nombra; la flecha es decorativa.
 */
export function SenalTocable() {
  return (
    <span className="text-marca">
      <Icono nombre="seguir" tamano="size-8" />
    </span>
  );
}

/**
 * Cómo va lo que pide una tarjeta de formulario — SPEC-KRILINXI-058. `completo`: todos sus datos están bien. `con-errores`:
 * alguno ya mostró un error. Sin esto (`null` o ausente) la tarjeta no marca nada: vacía o a medio llenar no se regaña.
 */
export type EstadoDeTarjeta = 'completo' | 'con-errores' | null;

/** Cada marca: el ícono, el texto para el lector de pantalla, y los colores del tema (los pares ya están medidos en tema.test.ts). */
const MARCA_DE_ESTADO = {
  completo: { icono: 'listo', texto: 'Completo', clases: 'border-exito-borde bg-exito-fondo text-exito-texto' },
  'con-errores': { icono: 'cerrar', texto: 'Hay datos para corregir', clases: 'border-peligro-borde bg-peligro-fondo text-peligro-texto' },
} as const;

/** El visto o la equis de la esquina de arriba a la derecha. Se distingue por su forma, no solo por el color. */
function MarcaDeEstado({ estado }: { estado: Exclude<EstadoDeTarjeta, null> }) {
  const { icono, texto, clases } = MARCA_DE_ESTADO[estado];
  return (
    <span className={`absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-full border-2 ${clases}`} title={texto}>
      <Icono nombre={icono} tamano="size-5" />
      <span className="sr-only">{texto}</span>
    </span>
  );
}

type Props = {
  /** Encabezado de la tarjeta. Si está, la tarjeta es una sección con ese nombre. */
  titulo?: string;
  /**
   * El nivel del encabezado: 2 por defecto. 3 cuando la tarjeta va dentro de una sección que ya
   * tiene su `h2` (el detalle de una boleta, SPEC-KRILINXI-025): los niveles dicen qué está
   * dentro de qué, y el lector de pantalla navega por ellos.
   */
  nivel?: 2 | 3;
  /** `informa` por defecto; `destaca` para un número que importa (SPEC-KRILINXI-037). */
  tipo?: Exclude<TipoTarjeta, 'toca'>;
  /** Una marca chica en la esquina de arriba a la derecha: un visto si todo está bien, una equis si hay errores. */
  estado?: EstadoDeTarjeta;
  children: ReactNode;
};

/**
 * Agrupa lo que va junto, sobre el fondo de la página — SPEC-KRILINXI-022: los datos de un
 * cliente, las cuentas de una boleta, un número del panel.
 *
 * Con título es una `<section>` nombrada por su encabezado: un lector de pantalla la anuncia
 * ("Datos del cliente, región") y los tests la encuentran con `getByRole('region', { name })`.
 * Sin título es solo un recuadro, sin nada que anunciar.
 */
export function Tarjeta({ titulo, nivel = 2, tipo = 'informa', estado = null, children }: Props) {
  const id = useId();
  // `relative` solo cuando hay marca: es contra lo que se coloca en la esquina.
  const clases = estado ? `relative ${ESTILO_TARJETA[tipo]}` : ESTILO_TARJETA[tipo];
  if (!titulo) return <div className={clases}>{children}</div>;
  return (
    <section aria-labelledby={id} className={clases}>
      {estado && <MarcaDeEstado estado={estado} />}
      {nivel === 2 ? (
        <h2 id={id} className={`text-2xl font-bold text-texto ${estado ? 'pr-12' : ''}`}>
          {titulo}
        </h2>
      ) : (
        <h3 id={id} className={`text-xl font-bold text-texto ${estado ? 'pr-12' : ''}`}>
          {titulo}
        </h3>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}
