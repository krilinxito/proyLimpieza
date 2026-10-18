import { desdeDecimal } from '../../../lib/money';
import { TEXTO_TRAMO, type Tramo } from '../types';
import { BarrasHorizontales } from './graficos/BarrasHorizontales';
import { COLOR_TRAMO } from './graficos/colores';
import { hayDatos } from './graficos/escalas';
import { Grafico } from './graficos/Grafico';
import { boletas, bs } from './montos';

type Props = {
  nombre: string;
  /** Los tres tramos vienen siempre, aunque estén en cero. Con `total`, son plata que se debe. */
  tramos: readonly { tramo: Tramo; cantidad: number; total?: string }[];
  /** Cómo termina el detalle: "sin cobrar", "sin recoger". */
  queFalta: string;
};

const rotulo = ({ cantidad, total }: Props['tramos'][number]) => `${boletas(cantidad)}${total !== undefined ? ` — ${bs(total)}` : ''}`;

/**
 * Cuántas hay en cada tramo de antigüedad — SPEC-KRILINXI-015, como gráfico desde SPEC-KRILINXI-026:
 * una barra por tramo, en un solo tono que se oscurece con los días. Lo viejo es lo que más pesa,
 * y se ve sin leer.
 *
 * Con monto (los saldos), la barra mide la plata que se debe; sin monto (la ropa), las boletas.
 */
export function Antiguedad({ nombre, tramos, queFalta }: Props) {
  const conMonto = tramos.every((t) => t.total !== undefined);
  const valor = (t: Props['tramos'][number]) => (t.total !== undefined ? desdeDecimal(t.total) : t.cantidad);
  return (
    <Grafico
      nombre={nombre}
      vacio={!hayDatos(tramos.map((t) => t.cantidad))}
      pista="Tocá una barra para ver su detalle."
      tabla={{
        encabezados: conMonto ? ['Antigüedad', 'Boletas', 'Falta cobrar'] : ['Antigüedad', 'Boletas'],
        filas: tramos.map((t) => ({
          clave: t.tramo,
          celdas: [TEXTO_TRAMO[t.tramo], boletas(t.cantidad), ...(t.total !== undefined ? [bs(t.total)] : [])],
        })),
      }}
    >
      {(elegir) => (
        <BarrasHorizontales
          maximo={Math.max(0, ...tramos.map(valor))}
          elegir={elegir}
          barras={tramos.map((t) => ({
            clave: t.tramo,
            etiqueta: TEXTO_TRAMO[t.tramo],
            rotulo: rotulo(t),
            tramos: [{ clave: t.tramo, valor: valor(t), clase: COLOR_TRAMO[t.tramo].marca }],
            detalle: `${TEXTO_TRAMO[t.tramo]}: ${rotulo(t)} ${queFalta}.`,
          }))}
        />
      )}
    </Grafico>
  );
}
