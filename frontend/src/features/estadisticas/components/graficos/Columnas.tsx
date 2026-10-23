import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { animar } from './animacion';
import type { Color } from './colores';
import { DetalleFlotante } from './DetalleFlotante';
import { indiceDelMayor, rotulosDelEje } from './escalas';

export type Columna = {
  clave: string;
  valor: number;
  /** Lo que se escribe debajo, en el eje, si entra: "15/10". */
  eje: string;
  /** Lo que se lee al tocarla o enfocarla, y su nombre para el lector de pantalla. */
  detalle: string;
};

type Props = {
  columnas: readonly Columna[];
  elegir: (detalle: string) => void;
  /** El detalle del dato elegido: ese se ve entero y los demás, más suaves. */
  seleccionado?: string | null;
  /** El matiz de la tarjeta (`COLOR_TARJETA`). */
  color: Color;
};

const ALTO = 192;

/**
 * Columnas a lo largo del tiempo — SPEC-KRILINXI-026, dibujadas con Recharts desde SPEC-KRILINXI-063: una por día,
 * también los que quedan en cero, que se ven como un hueco sobre la línea de base (un día sin ropa es un dato).
 *
 * La interacción es la de Recharts, que no depende del mouse: se enfoca con Tab y las flechas recorren los días, tocar
 * una columna la elige, y el detalle del día elegido se escribe debajo (`DetalleFlotante`) y se resalta en el dibujo.
 * Solo la columna más alta lleva su número arriba: un número en cada columna no lo lee nadie.
 *
 * El color es una clase del tema (`text-ropa`) en el contenedor, y cada columna pinta con `currentColor`: así sigue al
 * tema claro y al oscuro sin escribir ningún color acá, y una columna apagada (la que no está elegida) solo cambia su
 * `fillOpacity`.
 */
export function Columnas({ columnas, elegir, seleccionado = null, color }: Props) {
  const mayor = indiceDelMayor(columnas.map((c) => c.valor));
  const rotulos = rotulosDelEje(columnas.length);
  const animada = animar();

  return (
    <div className={`mt-4 ${color.trazo}`}>
      <ResponsiveContainer width="100%" height={ALTO} initialDimension={{ width: 640, height: ALTO }}>
        <BarChart
          data={[...columnas]}
          margin={{ top: 28, right: 24, bottom: 0, left: 24 }}
          barCategoryGap="12%"
          // Tocar una columna la elige también donde el toque no mueve ningún puntero (una tablet).
          onClick={(estado) => {
            const elegida = columnas[Number(estado.activeTooltipIndex)];
            if (elegida) elegir(elegida.detalle);
          }}
        >
          <XAxis
            dataKey="eje"
            interval={0}
            tickLine={false}
            tickFormatter={(eje: string, i: number) => (rotulos.has(i) ? eje : '')}
            axisLine={{ className: 'stroke-borde', strokeWidth: 2 }}
            tick={{ className: 'fill-texto-suave', fontSize: 16 }}
          />
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ className: 'fill-fondo' }}
            content={(p) => <DetalleFlotante active={p.active} payload={p.payload} detalleDe={(c: Columna) => c.detalle} elegir={elegir} />}
          />
          <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={animada}>
            {columnas.map((columna) => (
              <Cell key={columna.clave} fill="currentColor" fillOpacity={seleccionado !== null && seleccionado !== columna.detalle ? 0.35 : 1} />
            ))}
            <LabelList
              dataKey="valor"
              content={({ x, y, width, index, value }) =>
                index === mayor ? (
                  <text x={Number(x) + Number(width) / 2} y={Number(y) - 8} textAnchor="middle" className="fill-texto text-lg font-semibold">
                    {String(value)}
                  </text>
                ) : null
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
