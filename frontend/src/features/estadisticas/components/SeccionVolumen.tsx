import { fechaParaLeer } from '../periodo';
import type { Volumen } from '../types';
import { Columnas } from './graficos/Columnas';
import { hayDatos } from './graficos/escalas';
import { Grafico } from './graficos/Grafico';
import { boletas } from './montos';
import { SeccionPanel } from './SeccionPanel';

const anuladas = (n: number) => (n === 1 ? '1 anulada' : `${n} anuladas`);

/** "4 boletas (1 anulada)": lo de un día, en el detalle de su columna y en la tabla. */
const delDia = (dia: Volumen['porDia'][number]) => `${boletas(dia.ordenes)}${dia.anuladas > 0 ? ` (${anuladas(dia.anuladas)})` : ''}`;

/**
 * Cuánta ropa entró cada día — SPEC-KRILINXI-016, como columnas desde SPEC-KRILINXI-026: es una
 * tendencia en el tiempo, de una sola serie. Vienen todos los días del período, también los que
 * quedan en 0: un día sin ropa es un dato, no un hueco en el eje.
 */
export function SeccionVolumen({ volumen, periodo }: { volumen: Volumen; periodo: string }) {
  return (
    <SeccionPanel nombre="Ropa recibida" titulo={`Ropa recibida ${periodo}`}>
      <p className="mt-2 text-3xl font-bold text-texto">{boletas(volumen.total)}</p>
      {volumen.anuladas > 0 && <p className="mt-1 text-xl text-texto-suave">De esas, {anuladas(volumen.anuladas)}.</p>}
      <Grafico
        nombre="Ropa recibida por día"
        vacio={!hayDatos(volumen.porDia.map((d) => d.ordenes))}
        pista="Tocá un día para ver cuánta ropa entró."
        tabla={{
          encabezados: ['Día', 'Ropa recibida'],
          filas: volumen.porDia.map((dia) => ({ clave: dia.fecha, celdas: [fechaParaLeer(dia.fecha), delDia(dia)] })),
        }}
      >
        {(elegir) => (
          <Columnas
            elegir={elegir}
            columnas={volumen.porDia.map((dia) => ({
              clave: dia.fecha,
              valor: dia.ordenes,
              // "15/10": el año ya lo dice el título, y en el eje no entra la fecha entera.
              eje: fechaParaLeer(dia.fecha).slice(0, 5),
              detalle: `${fechaParaLeer(dia.fecha)}: ${delDia(dia)}`,
            }))}
          />
        )}
      </Grafico>
    </SeccionPanel>
  );
}
