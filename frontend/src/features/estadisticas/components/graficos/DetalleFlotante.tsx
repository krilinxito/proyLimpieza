import { useEffect } from 'react';

type Props = {
  /** Lo que Recharts le pasa al contenido del tooltip: si hay un dato activo y cuál. */
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  /** El texto de ese dato: el mismo que se lee al tocar y el de la tabla. */
  detalleDe: (dato: never) => string;
  elegir: (detalle: string) => void;
};

/**
 * Lo que dice un gráfico al tocar o enfocar un dato — SPEC-KRILINXI-063. Es el contenido del tooltip de Recharts, y
 * hace dos cosas con el mismo texto:
 *
 *  - lo **escribe en el detalle de debajo del gráfico** (`elegir`), que es una región `aria-live`: así lo lee el lector
 *    de pantalla, y lo ve quien toca con el dedo (sin mouse no hay "pasar por encima");
 *  - lo **dibuja flotando junto al dato**, para quien mira el gráfico. Va `aria-hidden`: el lector ya lo oyó arriba.
 *
 * Recharts lo activa con el mouse, con el toque y con las flechas del teclado (el gráfico se enfoca con Tab), así que
 * ninguno de los tres caminos depende del otro.
 */
export function DetalleFlotante({ active, payload, detalleDe, elegir }: Props) {
  const dato = active ? payload?.[0]?.payload : undefined;
  const detalle = dato === undefined ? null : detalleDe(dato as never);

  useEffect(() => {
    if (detalle) elegir(detalle);
  }, [detalle, elegir]);

  if (!detalle) return null;
  return (
    <div aria-hidden="true" className="max-w-72 rounded-lg border-2 border-borde bg-superficie px-3 py-2 text-lg text-texto shadow-md">
      {detalle}
    </div>
  );
}
