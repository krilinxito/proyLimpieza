import { indiceDelMayor, largo, porciento, rotulosDelEje, TOPE_COLUMNA } from './escalas';
import { alUsar, CLASES_MARCA_TOCABLE } from './Grafico';
import { COLOR_UNICO } from './colores';

export type Columna = {
  clave: string;
  valor: number;
  /** Lo que se escribe debajo, en el eje, si entra: "15/10". */
  eje: string;
  /** Lo que se lee al tocarla o enfocarla, y su nombre para el lector de pantalla. */
  detalle: string;
};

type Props = { columnas: readonly Columna[]; elegir: (detalle: string) => void };

/**
 * Columnas a lo largo del tiempo — SPEC-KRILINXI-026: una por día, también los que quedan en cero,
 * que se ven como un hueco sobre la línea de base (un día sin ropa es un dato).
 *
 * Cada columna es un `<button>` que reparte el ancho con las demás (`flex-1`), así no hace falta
 * calcular anchos ni escribirlos en un `style`. Solo la más alta lleva su número arriba: un número
 * en cada columna no lo lee nadie. Las demás se leen tocándolas, y en la tabla del gráfico.
 */
export function Columnas({ columnas, elegir }: Props) {
  const maximo = Math.max(0, ...columnas.map((c) => c.valor));
  const mayor = indiceDelMayor(columnas.map((c) => c.valor));
  const rotulos = rotulosDelEje(columnas.length);

  return (
    <div>
      <div className="flex h-48 items-end gap-0.5 border-b-2 border-borde pt-8">
        {columnas.map((columna, i) => {
          const alto = largo(columna.valor, maximo, TOPE_COLUMNA);
          return (
            <button
              key={columna.clave}
              type="button"
              aria-label={columna.detalle}
              {...alUsar(elegir, columna.detalle)}
              className={`flex h-full min-w-0 flex-1 justify-center ${CLASES_MARCA_TOCABLE}`}
            >
              <svg aria-hidden="true" width="100%" height="100%" className="block max-w-6 overflow-visible">
                {alto > 0 && (
                  <>
                    <rect x="0" y={porciento(100 - alto)} width="100%" height={porciento(alto)} rx="4" className={COLOR_UNICO.marca} />
                    {/* La base recta sobre el eje: se tapan las dos esquinas de abajo. */}
                    <rect x="0" y={porciento(100 - alto / 2)} width="100%" height={porciento(alto / 2)} className={COLOR_UNICO.marca} />
                  </>
                )}
                {i === mayor && (
                  <text x="50%" y={porciento(100 - alto)} dy="-8" textAnchor="middle" className="fill-texto text-lg font-semibold">
                    {columna.valor}
                  </text>
                )}
              </svg>
            </button>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-1 flex gap-0.5">
        {columnas.map((columna, i) => (
          <span key={columna.clave} className="flex min-w-0 flex-1 justify-center text-base whitespace-nowrap text-texto-suave">
            {rotulos.has(i) ? columna.eje : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
