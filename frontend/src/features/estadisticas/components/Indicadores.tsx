import { Tarjeta } from '../../../components/Tarjeta';
import type { Panel } from '../types';
import { boletas, bs } from './montos';

type Periodos = { ingresos: string; pendientes: string; historia: string };

/**
 * La fila de arriba del tablero — SPEC-KRILINXI-026: los cuatro números que el admin mira primero,
 * cada uno en su tarjeta. Un número solo no pide un gráfico: escrito grande se lee antes que
 * cualquier barra.
 *
 * Son los mismos que trae cada sección, tal como los manda el servidor: acá no se suma nada.
 * Cada uno con su período, porque no todos miran los mismos días (ver `periodo.ts`).
 */
export function Indicadores({ panel, periodos }: { panel: Panel; periodos: Periodos }) {
  const indicadores = [
    { nombre: `Cobrado ${periodos.ingresos}`, valor: bs(panel.ingresos.total) },
    { nombre: `Falta cobrar ${periodos.pendientes}`, valor: bs(panel.saldos.total), extra: `En ${boletas(panel.saldos.cantidad)}` },
    { nombre: `Ropa sin recoger ${periodos.pendientes}`, valor: boletas(panel.sinRecoger.cantidad) },
    { nombre: `Ropa recibida ${periodos.historia}`, valor: boletas(panel.volumen.total) },
  ];
  return (
    <section aria-label="Resumen" className="mt-8">
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map(({ nombre, valor, extra }) => (
          <Tarjeta key={nombre}>
            <dt className="text-lg font-semibold text-texto-suave">{nombre}</dt>
            <dd className="mt-2 text-4xl font-bold text-texto">{valor}</dd>
            {extra && <dd className="mt-1 text-lg text-texto-suave">{extra}</dd>}
          </Tarjeta>
        ))}
      </dl>
    </section>
  );
}
