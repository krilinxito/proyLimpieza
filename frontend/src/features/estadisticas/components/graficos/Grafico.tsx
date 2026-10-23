import { useState, type ReactNode } from 'react';

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
 */
export function Grafico({ nombre, vacio, pista, tabla, children }: Props) {
  const [detalle, setDetalle] = useState<string | null>(null);

  if (vacio) return <p className="mt-4 text-xl text-texto-suave">No hay datos en este período.</p>;

  const [primero, ...resto] = tabla.encabezados;
  return (
    <figure aria-label={nombre} className="mt-4 grid gap-3">
      {children(setDetalle, detalle)}
      <p aria-live="polite" className="min-h-8 text-lg text-texto">
        {detalle ?? pista}
      </p>
      {/* El `sr-only` va en un contenedor, nunca en la `<table>`: Chrome dibuja el `<caption>` afuera de
          la caja recortada de la tabla, y el nombre se veía encima del gráfico (SPEC-KRILINXI-036). */}
      <div className="sr-only">
        <table>
          <caption>{nombre}</caption>
          <thead>
            <tr>
              <th scope="col">{primero}</th>
              {resto.map((encabezado) => (
                <th key={encabezado} scope="col">
                  {encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla.filas.map(({ clave, celdas: [cabeza, ...celdas] }) => (
              <tr key={clave}>
                <th scope="row">{cabeza}</th>
                {celdas.map((celda, i) => (
                  <td key={i}>{celda}</td>
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
