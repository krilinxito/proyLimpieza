import { useId, useState } from 'react';
import { METODOS_PAGO, TEXTO_METODO_PAGO, type MetodoPago } from '../../../lib/dominio';
import { desdeDecimal } from '../../../lib/money';
import { useIngresosPorDia } from '../hooks/useIngresosPorDia';
import { useRangoDeDias } from '../hooks/useRangoDeDias';
import { fechaParaLeer, type Filtro } from '../periodo';
import type { IngresoDia } from '../types';
import { COLOR_METODO, COLOR_TARJETA } from './graficos/colores';
import { hayDatos } from './graficos/escalas';
import { useGrande } from './graficos/grande';
import { Grafico } from './graficos/Grafico';
import { Leyenda } from './graficos/Leyenda';
import { Lineas } from './graficos/Lineas';
import { AvisoDeTarjeta, Esqueleto } from './Esqueleto';
import { bs } from './montos';
import { RangoDeDias } from './RangoDeDias';
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

/** El desglose completo de un día, para la vista grande: el total y cada forma de pago, también las que quedan en cero. */
function desgloseDelDia(dia: IngresoDia): string[] {
  return [`Total: ${bs(dia.total)}`, ...METODOS_PAGO.map((m) => `${TEXTO_METODO_PAGO[m]}: ${bs(dia.porMetodo[m])}`)];
}

/**
 * ¿Cómo vino la caja día a día? — SPEC-KRILINXI-044: una línea con lo cobrado cada día, y a elección una
 * línea por forma de pago (tres como mucho, con los colores y la leyenda de siempre). Los días sin cobros
 * están en cero, y la línea baja hasta ahí en vez de cortarse.
 *
 * Se pide aparte del resto del panel (`useIngresosPorDia`), así que tiene su propio aviso si falla. Ningún
 * monto se suma acá: el total de cada día y el de cada forma de pago los manda el servidor
 * (SPEC-KRILINXI-043, CLAUDE.md §8); los centavos de `desdeDecimal` solo miden la altura de los puntos.
 *
 * Desde SPEC-KRILINXI-065 tiene vista grande: ahí la leyenda apaga y prende cada forma de pago, y se puede acercar a un
 * rango de días (`Tendencia` lo sabe por `useGrande()`).
 */
export function SeccionTendencia({ filtro, periodo }: { filtro: Filtro; periodo: string }) {
  const { estado, recargar } = useIngresosPorDia(filtro);
  const [vista, setVista] = useState<Vista>('total');
  const conDatos = estado.tipo === 'listo' && hayDatos(estado.datos.porDia.map((d) => desdeDecimal(d.total)));

  return (
    <SeccionPanel nombre="Cobrado por día" pregunta="¿Cómo vino la caja día a día?" periodo={periodo} ampliable={conDatos}>
      {estado.tipo === 'cargando' && <Esqueleto texto="Buscando lo cobrado cada día…" />}

      {(estado.tipo === 'sin-conexion' || estado.tipo === 'error') && <AvisoDeTarjeta estado={estado} recargar={recargar} />}

      {estado.tipo === 'listo' && <Tendencia dias={estado.datos.porDia} total={estado.datos.total} vista={vista} alCambiar={setVista} />}
    </SeccionPanel>
  );
}

function Tendencia({ dias, total, vista, alCambiar }: { dias: IngresoDia[]; total: string; vista: Vista; alCambiar: (vista: Vista) => void }) {
  const grande = useGrande();
  // Dos grupos de botones de radio (la tarjeta y la vista grande) con el mismo `name` se anularían entre sí.
  const nombreDelGrupo = useId();
  const rango = useRangoDeDias(dias.map((d) => d.fecha));
  const [apagadas, setApagadas] = useState<ReadonlySet<MetodoPago>>(new Set());

  // Solo la vista grande acerca a un rango y apaga series; la tarjeta siempre muestra todo.
  const visibles = grande ? rango.recortar(dias) : dias;
  const totales = visibles.map((d) => desdeDecimal(d.total));
  const porForma = METODOS_PAGO.filter((m) => !(grande && apagadas.has(m))).map((m) => ({ metodo: m, valores: visibles.map((d) => desdeDecimal(d.porMetodo[m])) }));
  // Cada vista se mide con su propio máximo: la de formas de pago tiene líneas más bajas que el total.
  const maximo = Math.max(0, ...(vista === 'total' ? totales : porForma.flatMap((f) => f.valores)));

  function alternar(metodo: string) {
    const m = metodo as MetodoPago;
    setApagadas((antes) => {
      const ahora = new Set(antes);
      if (ahora.has(m)) ahora.delete(m);
      else ahora.add(m);
      return ahora;
    });
  }

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
              <input type="radio" name={nombreDelGrupo} className="size-6" checked={vista === opcion.vista} onChange={() => alCambiar(opcion.vista)} />
              {opcion.texto}
            </label>
          ))}
        </div>
      </fieldset>

      {grande && <RangoDeDias fechas={dias.map((d) => d.fecha)} rango={rango} />}

      <Grafico
        nombre="Cobrado por día"
        vacio={!hayDatos(totales)}
        pista="Toca un día para ver cuánto se cobró y con qué."
        desglose={(detalle) => {
          const dia = visibles.find((d) => detalleDelDia(d) === detalle);
          return dia && desgloseDelDia(dia);
        }}
        tabla={{
          encabezados: ['Día', 'Total', ...METODOS_PAGO.map((m) => TEXTO_METODO_PAGO[m])],
          filas: visibles.map((d) => ({ clave: d.fecha, celdas: [fechaParaLeer(d.fecha), bs(d.total), ...METODOS_PAGO.map((m) => bs(d.porMetodo[m]))] })),
        }}
      >
        {(elegir) => (
          <>
            {vista === 'formas' && (
              <Leyenda
                nombre="Formas de pago"
                series={METODOS_PAGO.map((m) => ({ clave: m, texto: TEXTO_METODO_PAGO[m], muestra: COLOR_METODO[m].muestra }))}
                {...(grande ? { apagadas, alAlternar: alternar } : {})}
              />
            )}
            <Lineas
              maximo={maximo}
              elegir={elegir}
              dias={visibles.map((d) => ({
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
