import { METODOS_PAGO, TEXTO_METODO_PAGO } from '../../../lib/dominio';
import { desdeDecimal } from '../../../lib/money';
import type { Ingresos } from '../types';
import { BarrasHorizontales } from './graficos/BarrasHorizontales';
import { COLOR_METODO } from './graficos/colores';
import { hayDatos } from './graficos/escalas';
import { Grafico } from './graficos/Grafico';
import { Leyenda } from './graficos/Leyenda';
import { bs } from './montos';
import { SeccionPanel } from './SeccionPanel';

type DeSucursal = Ingresos['porSucursal'][number];

/** Los métodos con algo cobrado, en su orden fijo. Uno en cero no se rotula ni ocupa lugar. */
const conIngresos = (s: DeSucursal) => METODOS_PAGO.filter((m) => desdeDecimal(s.porMetodo[m]) > 0);

function detalle(s: DeSucursal): string {
  const metodos = conIngresos(s).map((m) => `${TEXTO_METODO_PAGO[m]} ${bs(s.porMetodo[m])}`);
  return `${s.sucursal}: ${bs(s.total)} cobrado${metodos.length ? `. ${metodos.join(', ')}.` : '.'}`;
}

/**
 * ¿Cuánto se cobró en cada sucursal? — SPEC-KRILINXI-015, como gráfico desde SPEC-KRILINXI-026 y
 * como una de las tarjetas del dashboard desde SPEC-KRILINXI-042: una barra por sucursal, apilada por método. Es "parte de un todo", y con
 * cuatro partes una barra apilada se compara mejor que una torta.
 *
 * Los totales vienen sumados del servidor. Los centavos de `desdeDecimal` son solo para medir las
 * barras: ningún número que se lee sale de una suma hecha acá.
 */
export function SeccionIngresos({ ingresos, periodo }: { ingresos: Ingresos; periodo: string }) {
  const totales = ingresos.porSucursal.map((s) => desdeDecimal(s.total));
  return (
    <SeccionPanel nombre="Cobrado por sucursal" pregunta="¿Cuánto se cobró en cada sucursal?" periodo={periodo}>
      <p className="mt-2 text-3xl font-bold text-texto">{bs(ingresos.total)}</p>
      <Grafico
        nombre="Cobrado por sucursal y forma de pago"
        vacio={!hayDatos(totales)}
        pista="Toca una sucursal para ver cuánto se cobró de cada forma."
        tabla={{
          encabezados: ['Sucursal', ...METODOS_PAGO.map((m) => TEXTO_METODO_PAGO[m]), 'Total'],
          filas: ingresos.porSucursal.map((s) => ({
            clave: s.sucursalId,
            celdas: [s.sucursal, ...METODOS_PAGO.map((m) => bs(s.porMetodo[m])), bs(s.total)],
          })),
        }}
      >
        {(elegir, seleccionado) => (
          <>
            <Leyenda
              nombre="Formas de pago"
              series={METODOS_PAGO.map((m) => ({ clave: m, texto: TEXTO_METODO_PAGO[m], muestra: COLOR_METODO[m].muestra }))}
            />
            <BarrasHorizontales
              seleccionado={seleccionado}
              maximo={Math.max(0, ...totales)}
              elegir={elegir}
              barras={ingresos.porSucursal.map((s) => ({
                clave: s.sucursalId,
                etiqueta: `${s.sucursal}: ${bs(s.total)}`,
                tramos: METODOS_PAGO.map((m) => ({ clave: m, valor: desdeDecimal(s.porMetodo[m]), clase: COLOR_METODO[m].marca })),
                detalle: detalle(s),
                // Cada tramo con su monto, abajo y no adentro: un tramo angosto no tiene lugar para
                // el número, y escrito sobre el color no siempre se lee.
                debajo: (
                  <span className="flex flex-wrap gap-x-5 gap-y-1 text-lg text-texto">
                    {conIngresos(s).map((m) => (
                      <span key={m} className="flex items-center gap-2">
                        <span aria-hidden="true" className={`size-3 shrink-0 rounded-sm ${COLOR_METODO[m].muestra}`} />
                        {TEXTO_METODO_PAGO[m]} {bs(s.porMetodo[m])}
                      </span>
                    ))}
                  </span>
                ),
              }))}
            />
          </>
        )}
      </Grafico>
    </SeccionPanel>
  );
}
