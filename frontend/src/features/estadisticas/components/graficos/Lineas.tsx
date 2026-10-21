import { posicionX, posicionY, rotulosDelEje } from './escalas';
import { alUsar, CLASES_MARCA_TOCABLE } from './Grafico';

/** Una línea del gráfico: un valor por día, en el mismo orden que `dias`. */
export type SerieDeLinea = {
  clave: string;
  /** La clase `stroke-…` de la línea, escrita entera (Tailwind solo genera las que ve literales). */
  trazo: string;
  /** La clase `fill-…` de sus puntos. */
  relleno: string;
  valores: readonly number[];
};

export type DiaDeLinea = {
  clave: string;
  /** Lo que se escribe debajo, en el eje, si entra: "15/10". */
  eje: string;
  /** Lo que se lee al tocar o enfocar ese día, y su nombre para el lector de pantalla. */
  detalle: string;
};

type Props = {
  series: readonly SerieDeLinea[];
  dias: readonly DiaDeLinea[];
  /** El valor más alto del gráfico: todas las líneas se miden con la misma escala. */
  maximo: number;
  elegir: (detalle: string) => void;
};

const RADIO_DEL_PUNTO = 4;
const GROSOR_DE_LA_LINEA = 3;

/**
 * Un gráfico de líneas a lo largo del tiempo — SPEC-KRILINXI-044: un punto por día, también los que
 * quedan en cero, y cada línea los une de a dos sin saltearse ninguno.
 *
 * Como todo gráfico del panel (SPEC-KRILINXI-026), es SVG del proyecto, sin `viewBox`: las posiciones van
 * en porcentajes, como atributos. Por eso la línea no es una sola `<polyline>` (sus puntos son números, no
 * admiten `%`) sino un `<line>` entre cada par de días, que sí los admite.
 *
 * Nada depende del mouse: sobre el dibujo hay una fila de botones, uno por día, que reparten el ancho
 * (`flex-1`) igual que los puntos (`posicionX`). Tocar uno, o llegar con Tab, escribe el detalle de ese día.
 * Los botones van **debajo** del SVG en el orden de pintado (el SVG, que no recibe toques, se dibuja encima):
 * así el fondo de un botón al pasar por encima no tapa la línea.
 */
export function Lineas({ series, dias, maximo, elegir }: Props) {
  const rotulos = rotulosDelEje(dias.length);

  return (
    <div>
      <div className="relative mt-4 h-40 border-b-2 border-borde">
        <div className="absolute inset-0 flex">
          {dias.map((dia) => (
            <button
              key={dia.clave}
              type="button"
              aria-label={dia.detalle}
              {...alUsar(elegir, dia.detalle)}
              className={`h-full min-w-0 flex-1 ${CLASES_MARCA_TOCABLE}`}
            />
          ))}
        </div>
        <svg aria-hidden="true" width="100%" height="100%" className="pointer-events-none absolute inset-0 overflow-visible">
          {series.map((serie) => (
            <g key={serie.clave} data-serie={serie.clave}>
              {serie.valores.slice(1).map((valor, i) => (
                <line
                  key={dias[i + 1]?.clave}
                  x1={`${posicionX(i, dias.length)}%`}
                  y1={`${posicionY(serie.valores[i] ?? 0, maximo)}%`}
                  x2={`${posicionX(i + 1, dias.length)}%`}
                  y2={`${posicionY(valor, maximo)}%`}
                  strokeWidth={GROSOR_DE_LA_LINEA}
                  strokeLinecap="round"
                  className={serie.trazo}
                />
              ))}
              {serie.valores.map((valor, i) => (
                <circle
                  key={dias[i]?.clave}
                  cx={`${posicionX(i, dias.length)}%`}
                  cy={`${posicionY(valor, maximo)}%`}
                  r={RADIO_DEL_PUNTO}
                  className={serie.relleno}
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div aria-hidden="true" className="mt-1 flex">
        {dias.map((dia, i) => (
          <span key={dia.clave} className="flex min-w-0 flex-1 justify-center text-base whitespace-nowrap text-texto-suave">
            {rotulos.has(i) ? dia.eje : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
