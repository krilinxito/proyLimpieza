import { useState, type ReactNode } from 'react';
import { Boton } from '../../../../components/Boton';
import { useGrande } from './grande';

export type TablaDeDatos = {
  /** El primero nombra la columna de las filas (el día, la sucursal…). */
  encabezados: readonly string[];
  /** La primera celda de cada fila es su encabezado. */
  filas: readonly { clave: string; celdas: readonly string[] }[];
};

type Props = {
  /** El nombre del gráfico: lo anuncia el lector de pantalla y lo usan los tests. */
  nombre: string;
  /** Sin nada que dibujar, se dice en palabras en vez de mostrar un gráfico vacío. */
  vacio: boolean;
  /** Lo que se lee antes de elegir una barra: qué hacer para ver su detalle. */
  pista: string;
  tabla: TablaDeDatos;
  /**
   * Solo en la vista grande (SPEC-KRILINXI-065): el desglose completo del dato elegido, una línea por cosa ("Efectivo: Bs
   * 100,00"). Recibe el mismo texto que se lee al tocar el dato. Sin él, el panel dice solo ese texto.
   */
  desglose?: (detalle: string) => readonly string[] | undefined;
  /**
   * El dibujo. Recibe `elegir`, para que cada barra muestre su detalle al tocarla o enfocarla, y `seleccionado`, el
   * detalle ya elegido (o null), para resaltar ese dato y apagar un poco los demás (SPEC-KRILINXI-063).
   */
  children: (elegir: (detalle: string) => void, seleccionado: string | null) => ReactNode;
};

/**
 * Lo que tiene todo gráfico del panel — SPEC-KRILINXI-026, alrededor del dibujo:
 *
 *  - **Un nombre** (`<figure aria-label>`): el lector de pantalla dice "Cobrado por sucursal,
 *    figura" y los tests lo encuentran con `getByRole('figure', { name })`.
 *  - **El detalle de la barra elegida, en palabras.** Ningún dato depende de pasar el mouse: el
 *    admin puede estar en una tablet. Tocar una barra, o llegar a ella con Tab, escribe su detalle
 *    debajo, y `aria-live` hace que el lector de pantalla lo lea sin mover el foco.
 *  - **La tabla con los mismos números**, solo para el lector de pantalla (`sr-only`, en un contenedor
 *    alrededor): un dibujo no se puede leer en voz alta, una tabla sí.
 *
 * Desde SPEC-KRILINXI-065, en la **vista grande** (`useGrande()`) el detalle pasa a un panel junto al dibujo, con el
 * desglose del dato elegido en una lista, y aparece "Ver la tabla": la misma tabla, a la vista. Sigue habiendo una sola
 * región `aria-live` por gráfico.
 */
export function Grafico({ nombre, vacio, pista, tabla, desglose, children }: Props) {
  const [detalle, setDetalle] = useState<string | null>(null);
  const [tablaVisible, setTablaVisible] = useState(false);
  const grande = useGrande();

  if (vacio) return <p className="mt-4 text-xl text-texto-suave">No hay datos en este período.</p>;

  const [primero, ...resto] = tabla.encabezados;
  const lineas = grande && detalle !== null ? desglose?.(detalle) : undefined;
  // La misma tabla siempre: solo cambia si se ve (a la vista, en la vista grande, cuando se pide) o solo la lee el lector.
  const aLaVista = grande && tablaVisible;
  return (
    <figure aria-label={nombre} className={grande ? 'mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]' : 'mt-4 grid gap-3'}>
      <div className="min-w-0">{children(setDetalle, detalle)}</div>
      {grande ? (
        <div className="rounded-xl border-2 border-borde-suave p-4 lg:self-start">
          <h3 className="text-xl font-semibold text-texto">Detalle</h3>
          <div aria-live="polite" className="mt-2 text-lg text-texto">
            <p>{detalle ?? pista}</p>
            {lineas && lineas.length > 0 && (
              <ul className="mt-2 grid gap-1">
                {lineas.map((linea) => (
                  <li key={linea}>{linea}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p aria-live="polite" className="min-h-8 text-lg text-texto">
          {detalle ?? pista}
        </p>
      )}
      {grande && (
        <div className="lg:col-span-full">
          <Boton variante="secundario" tamano="compacto" onClick={() => setTablaVisible((v) => !v)}>
            {tablaVisible ? 'Ocultar la tabla' : 'Ver la tabla'}
          </Boton>
        </div>
      )}
      {/* El `sr-only` va en un contenedor, nunca en la `<table>`: Chrome dibuja el `<caption>` afuera de
          la caja recortada de la tabla, y el nombre se veía encima del gráfico (SPEC-KRILINXI-036). */}
      <div className={aLaVista ? 'overflow-x-auto lg:col-span-full' : 'sr-only'}>
        <table className="w-full border-collapse text-left text-lg text-texto">
          <caption className="pb-2 text-left text-xl font-semibold">{nombre}</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b-2 border-borde px-3 py-2">
                {primero}
              </th>
              {resto.map((encabezado) => (
                <th key={encabezado} scope="col" className="border-b-2 border-borde px-3 py-2">
                  {encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla.filas.map(({ clave, celdas: [cabeza, ...celdas] }) => (
              <tr key={clave}>
                <th scope="row" className="border-b border-borde-suave px-3 py-2 font-semibold">
                  {cabeza}
                </th>
                {celdas.map((celda, i) => (
                  <td key={i} className="border-b border-borde-suave px-3 py-2">
                    {celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * Lo que hace cada barra o columna al usarla: tocarla, llegar con Tab o pasar el mouse muestran
 * lo mismo. El mouse es un atajo, nunca el único camino.
 */
export function alUsar(elegir: (detalle: string) => void, detalle: string) {
  const mostrar = () => elegir(detalle);
  return { onClick: mostrar, onFocus: mostrar, onPointerEnter: mostrar };
}

/** El anillo de foco del tema, y una sombra al pasar por encima: la barra responde al tocarla. */
export const CLASES_MARCA_TOCABLE =
  'rounded-lg hover:bg-fondo focus-visible:bg-fondo focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco';
