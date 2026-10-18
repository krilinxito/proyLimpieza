import type { ReactNode } from 'react';
import { apilar, porciento } from './escalas';
import { alUsar, CLASES_MARCA_TOCABLE } from './Grafico';

export type Barra = {
  clave: string;
  /** Lo que es la barra, escrito arriba: "Centro: Bs 125,50", "Más de 30 días". */
  etiqueta: string;
  /** El valor, escrito en la punta de la barra. */
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
};

/** El alto de la barra en px, por debajo del tope de 24 de la guía: la barra no llena su lugar. */
const ALTO = 24;

/**
 * Barras horizontales — SPEC-KRILINXI-026: una por fila, con su nombre arriba y su valor en la
 * punta. Cada fila es un `<button>`: se toca o se enfoca, y muestra su detalle.
 *
 * El SVG no tiene `viewBox`: las posiciones van en porcentajes del ancho, así la barra se estira
 * con la pantalla y el texto queda del tamaño de la app. Los tramos se separan con un trazo del
 * color de la superficie, que se ve como un espacio blanco entre uno y otro.
 */
export function BarrasHorizontales({ barras, maximo, elegir }: Props) {
  return (
    <ul className="grid gap-2">
      {barras.map((barra) => {
        const tramos = apilar(barra.tramos, maximo);
        const ultimo = tramos.at(-1);
        const fin = ultimo ? ultimo.desde + ultimo.ancho : 0;
        const unico = tramos.length === 1 ? tramos[0] : undefined;
        return (
          <li key={barra.clave}>
            <button
              type="button"
              aria-label={barra.detalle}
              {...alUsar(elegir, barra.detalle)}
              className={`grid w-full gap-1 p-2 text-left ${CLASES_MARCA_TOCABLE}`}
            >
              <span className="text-xl font-semibold text-texto">{barra.etiqueta}</span>
              <svg aria-hidden="true" width="100%" height={ALTO + 4} className="block overflow-visible">
                {tramos.map((tramo) => (
                  <rect
                    key={tramo.clave}
                    x={porciento(tramo.desde)}
                    y="2"
                    width={porciento(tramo.ancho)}
                    height={ALTO}
                    rx={unico ? 4 : 0}
                    strokeWidth={tramos.length > 1 ? 2 : 0}
                    className={`${tramo.clase} stroke-superficie`}
                  />
                ))}
                {/* La punta redondeada y la base recta: se tapan las dos esquinas del lado del cero. */}
                {unico && (
                  <rect
                    x="0"
                    y="2"
                    width={porciento(unico.ancho / 2)}
                    height={ALTO}
                    className={unico.clase}
                  />
                )}
                {barra.rotulo && (
                  <text
                    x={porciento(fin)}
                    dx={fin > 0 ? 8 : 0}
                    y={2 + ALTO / 2}
                    dominantBaseline="central"
                    className="fill-texto text-lg font-semibold"
                  >
                    {barra.rotulo}
                  </text>
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
