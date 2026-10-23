import { useState } from 'react';
import { METODOS_PAGO, TEXTO_METODO_PAGO } from '../../../lib/dominio';
import { desdeDecimal } from '../../../lib/money';
import { useIngresosPorDia } from '../hooks/useIngresosPorDia';
import { fechaParaLeer, type Filtro } from '../periodo';
import type { IngresoDia } from '../types';
import { COLOR_METODO, COLOR_TARJETA } from './graficos/colores';
import { hayDatos } from './graficos/escalas';
import { Grafico } from './graficos/Grafico';
import { Leyenda } from './graficos/Leyenda';
import { Lineas } from './graficos/Lineas';
import { AvisoDeTarjeta, Esqueleto } from './Esqueleto';
import { bs } from './montos';
import { SeccionPanel } from './SeccionPanel';

type Vista = 'total' | 'formas';

const OPCIONES: { vista: Vista; texto: string }[] = [
  { vista: 'total', texto: 'El total' },
  { vista: 'formas', texto: 'Por forma de pago' },
];

/** "15/10/2026: Bs 125,50. Efectivo Bs 100,00, Pago con QR Bs 25,50." — lo de un día, al tocar su punto. */
function detalleDelDia(dia: IngresoDia): string {
  const metodos = METODOS_PAGO.filter((m) => desdeDecimal(dia.porMetodo[m]) > 0).map((m) => `${TEXTO_METODO_PAGO[m]} ${bs(dia.porMetodo[m])}`);
  return `${fechaParaLeer(dia.fecha)}: ${bs(dia.total)}${metodos.length ? `. ${metodos.join(', ')}.` : '.'}`;
}

/**
 * ¿Cómo vino la caja día a día? — SPEC-KRILINXI-044: una línea con lo cobrado cada día, y a elección una
 * línea por forma de pago (cuatro como mucho, con los colores y la leyenda de siempre). Los días sin cobros
 * están en cero, y la línea baja hasta ahí en vez de cortarse.
 *
 * Se pide aparte del resto del panel (`useIngresosPorDia`), así que tiene su propio aviso si falla. Ningún
 * monto se suma acá: el total de cada día y el de cada forma de pago los manda el servidor
 * (SPEC-KRILINXI-043, CLAUDE.md §8); los centavos de `desdeDecimal` solo miden la altura de los puntos.
 */
export function SeccionTendencia({ filtro, periodo }: { filtro: Filtro; periodo: string }) {
  const { estado, recargar } = useIngresosPorDia(filtro);
  const [vista, setVista] = useState<Vista>('total');

  return (
    <SeccionPanel nombre="Cobrado por día" pregunta="¿Cómo vino la caja día a día?" periodo={periodo} entera>
      {estado.tipo === 'cargando' && <Esqueleto texto="Buscando lo cobrado cada día…" />}

      {(estado.tipo === 'sin-conexion' || estado.tipo === 'error') && <AvisoDeTarjeta estado={estado} recargar={recargar} />}

      {estado.tipo === 'listo' && <Tendencia dias={estado.datos.porDia} total={estado.datos.total} vista={vista} alCambiar={setVista} />}
    </SeccionPanel>
  );
}

function Tendencia({ dias, total, vista, alCambiar }: { dias: IngresoDia[]; total: string; vista: Vista; alCambiar: (vista: Vista) => void }) {
  const totales = dias.map((d) => desdeDecimal(d.total));
  const porForma = METODOS_PAGO.map((m) => ({ metodo: m, valores: dias.map((d) => desdeDecimal(d.porMetodo[m])) }));
  // Cada vista se mide con su propio máximo: la de formas de pago tiene líneas más bajas que el total.
  const maximo = Math.max(0, ...(vista === 'total' ? totales : porForma.flatMap((f) => f.valores)));

  return (
    <>
      <p className="mt-2 text-3xl font-bold text-texto">{bs(total)}</p>

      <fieldset className="mt-4">
        <legend className="text-xl font-semibold text-texto">¿Cómo verlo?</legend>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {OPCIONES.map((opcion) => (
            <label
              key={opcion.vista}
              className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
                vista === opcion.vista ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
              }`}
            >
              <input type="radio" name="vista-de-la-caja" className="size-6" checked={vista === opcion.vista} onChange={() => alCambiar(opcion.vista)} />
              {opcion.texto}
            </label>
          ))}
        </div>
      </fieldset>

      <Grafico
        nombre="Cobrado por día"
        vacio={!hayDatos(totales)}
        pista="Toca un día para ver cuánto se cobró y con qué."
        tabla={{
          encabezados: ['Día', 'Total', ...METODOS_PAGO.map((m) => TEXTO_METODO_PAGO[m])],
          filas: dias.map((d) => ({ clave: d.fecha, celdas: [fechaParaLeer(d.fecha), bs(d.total), ...METODOS_PAGO.map((m) => bs(d.porMetodo[m]))] })),
        }}
      >
        {(elegir) => (
          <>
            {vista === 'formas' && (
              <Leyenda nombre="Formas de pago" series={METODOS_PAGO.map((m) => ({ clave: m, texto: TEXTO_METODO_PAGO[m], muestra: COLOR_METODO[m].muestra }))} />
            )}
            <Lineas
              maximo={maximo}
              elegir={elegir}
              dias={dias.map((d) => ({
                clave: d.fecha,
                // "15/10": el año ya lo dice el período, y en el eje no entra la fecha entera.
                eje: fechaParaLeer(d.fecha).slice(0, 5),
                detalle: detalleDelDia(d),
              }))}
              series={
                vista === 'total'
                  ? [{ clave: 'total', trazo: COLOR_TARJETA.caja.trazo, relleno: COLOR_TARJETA.caja.marca, valores: totales }]
                  : porForma.map((f) => ({ clave: f.metodo, trazo: COLOR_METODO[f.metodo].trazo, relleno: COLOR_METODO[f.metodo].marca, valores: f.valores }))
              }
            />
          </>
        )}
      </Grafico>
    </>
  );
}
