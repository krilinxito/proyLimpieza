import { useId, type ReactNode } from 'react';

type Props = {
  /** Encabezado de la tarjeta. Si está, la tarjeta es una sección con ese nombre. */
  titulo?: string;
  /**
   * El nivel del encabezado: 2 por defecto. 3 cuando la tarjeta va dentro de una sección que ya
   * tiene su `h2` (el detalle de una boleta, SPEC-KRILINXI-025): los niveles dicen qué está
   * dentro de qué, y el lector de pantalla navega por ellos.
   */
  nivel?: 2 | 3;
  children: ReactNode;
};

/**
 * Agrupa lo que va junto, sobre el fondo de la página — SPEC-KRILINXI-022: una orden en la
 * lista, los datos de un cliente, un número del panel.
 *
 * Con título es una `<section>` nombrada por su encabezado: un lector de pantalla la anuncia
 * ("Datos del cliente, región") y los tests la encuentran con `getByRole('region', { name })`.
 * Sin título es solo un recuadro, sin nada que anunciar.
 */
export function Tarjeta({ titulo, nivel = 2, children }: Props) {
  const id = useId();
  const clases = 'rounded-2xl border border-borde-suave bg-superficie p-5 shadow-sm';
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
