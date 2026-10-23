import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { animar } from './animacion';
import { DetalleFlotante } from './DetalleFlotante';
import { rotulosDelEje } from './escalas';

/** Una línea del gráfico: un valor por día, en el mismo orden que `dias`. */
export type SerieDeLinea = {
  clave: string;
  /** La clase `text-…` del color de la línea, escrita entera (Tailwind solo genera las que ve literales). */
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

const ALTO = 192;
const RADIO_DEL_PUNTO = 4;
const GROSOR_DE_LA_LINEA = 3;

/**
 * Un gráfico de líneas a lo largo del tiempo — SPEC-KRILINXI-044, dibujado con Recharts desde SPEC-KRILINXI-063: un
 * punto por día, también los que quedan en cero, y cada línea los une sin saltearse ninguno.
 *
 * Como en `Columnas`, la interacción es la de Recharts y no depende del mouse: se enfoca con Tab, las flechas recorren
 * los días, tocar un día lo elige, y su detalle se escribe debajo del gráfico (`DetalleFlotante`) y flota junto al punto.
 *
 * Cada línea pinta con `currentColor` y el color sale de una clase del tema (`text-caja`, `text-serie-1`): ni `style`
 * ni colores escritos acá, así sigue al tema claro y al oscuro. Una línea `monotone` no pasa nunca por arriba o por
 * debajo de sus puntos: no inventa un cobro de más ni un saldo negativo entre dos días.
 */
export function Lineas({ series, dias, maximo, elegir }: Props) {
  const rotulos = rotulosDelEje(dias.length);
  const animada = animar();
  const filas = dias.map((dia, i) => ({
    ...dia,
    ...Object.fromEntries(series.map((serie) => [serie.clave, serie.valores[i] ?? 0])),
  }));

  return (
    <div className="mt-4">
      <ResponsiveContainer width="100%" height={ALTO} initialDimension={{ width: 640, height: ALTO }}>
        <LineChart
          data={filas}
          margin={{ top: 12, right: 24, bottom: 0, left: 24 }}
          // Tocar un día lo elige también donde el toque no mueve ningún puntero (una tablet).
          onClick={(estado) => {
            const elegido = dias[Number(estado.activeTooltipIndex)];
            if (elegido) elegir(elegido.detalle);
          }}
        >
          <CartesianGrid vertical={false} className="stroke-borde-suave" />
          <XAxis
            dataKey="eje"
            interval={0}
            tickLine={false}
            tickFormatter={(eje: string, i: number) => (rotulos.has(i) ? eje : '')}
            axisLine={{ className: 'stroke-borde', strokeWidth: 2 }}
            tick={{ className: 'fill-texto-suave', fontSize: 16 }}
          />
          <YAxis hide domain={[0, Math.max(maximo, 1)]} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ className: 'stroke-borde' }}
            content={(p) => <DetalleFlotante active={p.active} payload={p.payload} detalleDe={(d: DiaDeLinea) => d.detalle} elegir={elegir} />}
          />
          {series.map((serie) => (
            <Line
              key={serie.clave}
              dataKey={serie.clave}
              type="monotone"
              className={serie.trazo}
              stroke="currentColor"
              strokeWidth={GROSOR_DE_LA_LINEA}
              strokeLinecap="round"
              dot={{ r: RADIO_DEL_PUNTO, className: serie.relleno, stroke: 'none' }}
              activeDot={{ r: RADIO_DEL_PUNTO * 2, className: serie.relleno, stroke: 'none' }}
              isAnimationActive={animada}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
