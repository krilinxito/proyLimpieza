import { useId, type ReactNode } from 'react';
import { Icono } from './iconos';

/**
 * Los tres tipos de tarjeta — SPEC-KRILINXI-037. Antes eran todas el mismo recuadro blanco, y no
 * se veía qué se podía tocar:
 *  - `informa` (la de siempre): agrupa datos. Liviana, sin sombra, con el borde apenas marcado.
 *  - `destaca`: un número que importa ("Cobrado hoy"). Sobre el color suave de la marca, con una
 *    franja gruesa a la izquierda.
 *  - `toca`: entera tocable, lleva a algo. Borde firme (el de los campos), sombra, y la flecha de
 *    `SenalTocable` a la derecha. No la arma este componente: un botón o un enlace no pueden llevar
 *    una `<section>` adentro, así que usan `ESTILO_TARJETA.toca` (`TarjetaOrden`, `FilaBoleta`).
 */
export type TipoTarjeta = 'informa' | 'destaca' | 'toca';

export const ESTILO_TARJETA: Record<TipoTarjeta, string> = {
  informa: 'rounded-2xl border border-borde-suave bg-superficie p-5',
  destaca: 'rounded-2xl border border-l-8 border-marca bg-marca-suave p-5',
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
export function Tarjeta({ titulo, nivel = 2, tipo = 'informa', children }: Props) {
  const id = useId();
  const clases = ESTILO_TARJETA[tipo];
  if (!titulo) return <div className={clases}>{children}</div>;
  return (
    <section aria-labelledby={id} className={clases}>
      {nivel === 2 ? (
        <h2 id={id} className="text-2xl font-bold text-texto">
          {titulo}
        </h2>
      ) : (
        <h3 id={id} className="text-xl font-bold text-texto">
          {titulo}
        </h3>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}
