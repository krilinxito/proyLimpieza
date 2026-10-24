import { createContext, useContext } from 'react';

/**
 * ¿Este gráfico se está dibujando en la vista grande? — SPEC-KRILINXI-065.
 *
 * La vista grande de una tarjeta (`VistaGrande`) no tiene su propio código por gráfico: vuelve a dibujar **los mismos
 * hijos** de la tarjeta dentro de un diálogo, con este contexto en `true`. Cada pieza que tiene algo más para ofrecer en
 * grande (`Grafico`, `Lineas`, `Columnas`, `Detalle`, y las tarjetas de los días) lo pregunta con `useGrande()` y se
 * acomoda. Así los datos son los mismos —salen de las mismas variables, no de un pedido nuevo a la API— y un gráfico nuevo
 * hereda la vista grande sin escribir nada.
 */
export const GrandeContext = createContext(false);

export function useGrande(): boolean {
  return useContext(GrandeContext);
}
