import { TEXTO_METODO_PAGO } from '../../../lib/dominio';
import { formatearBs } from '../../../lib/money';
import { totalesPorFormaDePago } from '../totalesPorFormaDePago';
import type { Ingresos } from '../types';
import { BarrasHorizontales } from './graficos/BarrasHorizontales';
import { COLOR_METODO } from './graficos/colores';
import { hayDatos } from './graficos/escalas';
import { Grafico } from './graficos/Grafico';
import { bs } from './montos';
import { SeccionPanel } from './SeccionPanel';

/**
 * ¿Cuánto se cobró con cada forma de pago? — SPEC-KRILINXI-042. Una barra por forma de pago, de todas
 * las sucursales juntas, cada una con el color que lleva en todo el panel (el efectivo es siempre el
 * azul). Las cuatro aparecen siempre y en el mismo orden, también la que está en cero: así el lugar
 * de cada una no cambia de un período a otro.
 *
 * El total general viene del servidor, igual que en todo el panel. El de cada forma de pago, no: lo
 * suma `totalesPorFormaDePago`, la única excepción a "el frontend no suma" (CLAUDE.md §8).
 */
export function SeccionFormasDePago({ ingresos, periodo }: { ingresos: Ingresos; periodo: string }) {
  const totales = totalesPorFormaDePago(ingresos);
  return (
    <SeccionPanel nombre="Cobrado por forma de pago" pregunta="¿Cuánto se cobró con cada forma de pago?" periodo={periodo}>
      <p className="mt-2 text-3xl font-bold text-texto">{bs(ingresos.total)}</p>
      <Grafico
        nombre="Cobrado con cada forma de pago"
        vacio={!hayDatos(totales.map((t) => t.total))}
        pista="Toca una forma de pago para ver cuánto se cobró."
        tabla={{
          encabezados: ['Forma de pago', 'Cobrado'],
          filas: totales.map((t) => ({ clave: t.metodo, celdas: [TEXTO_METODO_PAGO[t.metodo], formatearBs(t.total)] })),
        }}
      >
        {(elegir, seleccionado) => (
          <BarrasHorizontales
            seleccionado={seleccionado}
            maximo={Math.max(0, ...totales.map((t) => t.total))}
            elegir={elegir}
            barras={totales.map((t) => ({
              clave: t.metodo,
              etiqueta: TEXTO_METODO_PAGO[t.metodo],
              rotulo: formatearBs(t.total),
              tramos: [{ clave: t.metodo, valor: t.total, clase: COLOR_METODO[t.metodo].marca }],
              detalle: `${TEXTO_METODO_PAGO[t.metodo]}: ${formatearBs(t.total)} cobrado.`,
            }))}
          />
        )}
      </Grafico>
    </SeccionPanel>
  );
}
