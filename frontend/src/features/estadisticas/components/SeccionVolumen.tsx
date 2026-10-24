import { useRangoDeDias } from '../hooks/useRangoDeDias';
import { fechaParaLeer } from '../periodo';
import type { Volumen } from '../types';
import { COLOR_TARJETA } from './graficos/colores';
import { Columnas } from './graficos/Columnas';
import { hayDatos } from './graficos/escalas';
import { useGrande } from './graficos/grande';
import { Grafico } from './graficos/Grafico';
import { boletas } from './montos';
import { RangoDeDias } from './RangoDeDias';
import { SeccionPanel } from './SeccionPanel';

const anuladas = (n: number) => (n === 1 ? '1 anulada' : `${n} anuladas`);

type DiaDeVolumen = Volumen['porDia'][number];

/** "4 boletas (1 anulada)": lo de un día, en el detalle de su columna y en la tabla. */
const delDia = (dia: DiaDeVolumen) => `${boletas(dia.ordenes)}${dia.anuladas > 0 ? ` (${anuladas(dia.anuladas)})` : ''}`;

/** El desglose completo de un día, para la vista grande: cuántas entraron, cuántas se anularon y cuántas siguen. */
const desgloseDelDia = (dia: DiaDeVolumen) => [
  `Ropa recibida: ${boletas(dia.ordenes)}`,
  `Anuladas: ${dia.anuladas}`,
  `Siguen en pie: ${boletas(dia.ordenes - dia.anuladas)}`,
];

/**
 * Cuánta ropa entró cada día — SPEC-KRILINXI-016, como columnas desde SPEC-KRILINXI-026: es una
 * tendencia en el tiempo, de una sola serie. Vienen todos los días del período, también los que
 * quedan en 0: un día sin ropa es un dato, no un hueco en el eje.
 *
 * Desde SPEC-KRILINXI-065 tiene vista grande, donde se puede acercar a un rango de días.
 */
export function SeccionVolumen({ volumen, periodo }: { volumen: Volumen; periodo: string }) {
  return (
    <SeccionPanel
      nombre="Ropa recibida"
      pregunta="¿Cuánta ropa entró cada día?"
      periodo={periodo}
      ampliable={hayDatos(volumen.porDia.map((d) => d.ordenes))}
    >
      <PorDia volumen={volumen} />
    </SeccionPanel>
  );
}

function PorDia({ volumen }: { volumen: Volumen }) {
  const grande = useGrande();
  const rango = useRangoDeDias(volumen.porDia.map((d) => d.fecha));
  // Solo la vista grande acerca a un rango; la tarjeta siempre muestra todos los días.
  const dias = grande ? rango.recortar(volumen.porDia) : volumen.porDia;
  return (
    <>
      <p className="mt-2 text-3xl font-bold text-texto">{boletas(volumen.total)}</p>
      {volumen.anuladas > 0 && <p className="mt-1 text-xl text-texto-suave">De esas, {anuladas(volumen.anuladas)}.</p>}
      {grande && <RangoDeDias fechas={volumen.porDia.map((d) => d.fecha)} rango={rango} />}
      <Grafico
        nombre="Ropa recibida por día"
        vacio={!hayDatos(volumen.porDia.map((d) => d.ordenes))}
        pista="Toca un día para ver cuánta ropa entró."
        desglose={(detalle) => {
          const dia = dias.find((d) => `${fechaParaLeer(d.fecha)}: ${delDia(d)}` === detalle);
          return dia && desgloseDelDia(dia);
        }}
        tabla={{
          encabezados: ['Día', 'Ropa recibida'],
          filas: dias.map((dia) => ({ clave: dia.fecha, celdas: [fechaParaLeer(dia.fecha), delDia(dia)] })),
        }}
      >
        {(elegir, seleccionado) => (
          <Columnas
            color={COLOR_TARJETA.ropa}
            elegir={elegir}
            seleccionado={seleccionado}
            columnas={dias.map((dia) => ({
              clave: dia.fecha,
              valor: dia.ordenes,
              // "15/10": el año ya lo dice el título, y en el eje no entra la fecha entera.
              eje: fechaParaLeer(dia.fecha).slice(0, 5),
              detalle: `${fechaParaLeer(dia.fecha)}: ${delDia(dia)}`,
            }))}
          />
        )}
      </Grafico>
    </>
  );
}
