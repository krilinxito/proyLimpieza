import type { ReactNode } from 'react';
import { apilar, porciento } from './escalas';
import { alUsar, CLASES_MARCA_TOCABLE } from './Grafico';
import { PuntaRedondeada } from './PuntaRedondeada';

export type Barra = {
  clave: string;
  /** Lo que es la barra, escrito arriba: "Centro: Bs 125,50", "Más de 30 días". */
  etiqueta: string;
  /** El valor, escrito en la línea del nombre, a la derecha. */
  rotulo?: string;
  /** Uno por serie, en orden. Con uno solo es una barra común; con varios, apilada. */
  tramos: readonly { clave: string; valor: number; clase: string }[];
  /** Lo que se lee al tocarla o enfocarla, y su nombre para el lector de pantalla. */
  detalle: string;
  /** Lo que va debajo de la barra (los montos de cada tramo). */
  debajo?: ReactNode;
};

type Props = {
  barras: readonly Barra[];
  /** El valor de la barra más larga: todas se miden con la misma escala. */
  maximo: number;
  elegir: (detalle: string) => void;
  /** El detalle de la barra elegida (SPEC-KRILINXI-063): esa se ve entera y las demás, más suaves. */
  seleccionado?: string | null;
};

/** El alto de la barra en px, por debajo del tope de 24 de la guía: la barra no llena su lugar. */
const ALTO = 24;

/**
 * Barras horizontales — SPEC-KRILINXI-026: una por fila, con su nombre y su valor arriba. Cada
 * fila es un `<button>`: se toca o se enfoca, y muestra su detalle.
 *
 * El valor no va en la punta de la barra: en un teléfono no hay lugar al lado de una barra larga
 * para "8 boletas — Bs 12.410,00", y dentro de un SVG el texto no se puede medir ni bajar de
 * renglón. En la línea del nombre, con HTML, baja solo si no entra.
 *
 * El SVG no tiene `viewBox`: las posiciones van en porcentajes del ancho, así la barra se estira
 * con la pantalla y el texto queda del tamaño de la app. Una barra de un solo valor es una sola
 * pieza (`PuntaRedondeada`); en una apilada, solo el corte entre un tramo y el siguiente lleva una
 * línea del color de la superficie, que se ve como un espacio entre uno y otro (SPEC-KRILINXI-036).
 */
export function BarrasHorizontales({ barras, maximo, elegir, seleccionado = null }: Props) {
  return (
    <ul className="grid gap-2">
      {barras.map((barra) => {
        const tramos = apilar(barra.tramos, maximo);
        const unico = tramos.length === 1 ? tramos[0] : undefined;
        return (
          <li key={barra.clave}>
            <button
              type="button"
              aria-label={barra.detalle}
              {...alUsar(elegir, barra.detalle)}
              className={`grid w-full gap-1 p-2 text-left transition-opacity ${CLASES_MARCA_TOCABLE} ${
                seleccionado !== null && seleccionado !== barra.detalle ? 'opacity-60' : ''
              }`}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="text-xl font-semibold text-texto">{barra.etiqueta}</span>
                {barra.rotulo && <span className="text-lg font-semibold text-texto">{barra.rotulo}</span>}
              </span>
              <svg aria-hidden="true" width="100%" height={ALTO + 4} className="block">
                {unico ? (
                  <PuntaRedondeada x="0" y="2" width={porciento(unico.ancho)} height={ALTO} hacia="derecha" clase={unico.clase} />
                ) : (
                  <>
                    {tramos.map((tramo) => (
                      <rect
                        key={tramo.clave}
                        data-tramo={tramo.clave}
                        x={porciento(tramo.desde)}
                        y="2"
                        width={porciento(tramo.ancho)}
                        height={ALTO}
                        className={tramo.clase}
                      />
                    ))}
                    {/* El corte entre un tramo y el siguiente, del color de la superficie: solo donde cambia
                        la serie, no alrededor de cada tramo. */}
                    {tramos.slice(1).map((tramo) => (
                      <line
                        key={tramo.clave}
                        data-corte=""
                        x1={porciento(tramo.desde)}
                        x2={porciento(tramo.desde)}
                        y1="2"
                        y2={ALTO + 2}
                        strokeWidth={2}
                        className="stroke-superficie"
                      />
                    ))}
                  </>
                )}
              </svg>
              {barra.debajo}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
