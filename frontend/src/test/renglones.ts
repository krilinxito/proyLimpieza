/**
 * Escribir renglones de la boleta en una pantalla de prueba — creado en SPEC-KRILINXI-068.
 *
 * Desde esa spec, Registrar ropa ya no tiene "Qué deja" y "Precio (Bs)": tiene renglones ("Prenda 1", "Prenda 2"…), cada
 * uno con "Qué es", "Cuántas" y "Precio de cada una (Bs)". Al entregar, los cargos son renglones también ("Cargo 1"…).
 * Cada renglón es un grupo con nombre, así que sus campos se buscan dentro de él (los tres se llaman igual en todos).
 *
 *   escribirPrenda(1, { que: 'Camisa', precio: '10' });               // el renglón que ya viene
 *   escribirPrendas([{ que: 'Camisa', cuantas: '2', precio: '15' }, { que: 'Saco', precio: '20' }]);
 *   agregarCargo({ que: 'Recargo por almacenamiento', precio: '15' }); // toca "Agregar un cargo" y lo llena
 *
 * `cuantas` es opcional: el renglón ya viene con "1".
 */
import { fireEvent, screen, within } from '@testing-library/react';

export type PrendaEscrita = { que: string; cuantas?: string; precio: string };

/** El grupo de un renglón: "Prenda 1", "Cargo 2"… */
export function renglon(n: number, nombre: 'Prenda' | 'Cargo' = 'Prenda'): HTMLElement {
  return screen.getByRole('group', { name: `${nombre} ${n}` });
}

function llenar(grupo: HTMLElement, { que, cuantas, precio }: PrendaEscrita) {
  fireEvent.change(within(grupo).getByLabelText('Qué es'), { target: { value: que } });
  if (cuantas !== undefined) fireEvent.change(within(grupo).getByLabelText('Cuántas'), { target: { value: cuantas } });
  fireEvent.change(within(grupo).getByLabelText('Precio de cada una (Bs)'), { target: { value: precio } });
}

/** Llena el renglón `n` de la boleta (el primero ya está en pantalla). */
export function escribirPrenda(n: number, prenda: PrendaEscrita) {
  llenar(renglon(n), prenda);
}

/** Llena la primera prenda y agrega las que siguen con "Agregar otra prenda". */
export function escribirPrendas(prendas: PrendaEscrita[]) {
  prendas.forEach((prenda, i) => {
    if (i > 0) fireEvent.click(screen.getByRole('button', { name: 'Agregar otra prenda' }));
    escribirPrenda(i + 1, prenda);
  });
}

/** Toca "Agregar un cargo" y llena el cargo nuevo (el último), dentro del formulario de entrega que se le pase. */
export function agregarCargo(cargo: PrendaEscrita, formulario: HTMLElement = document.body) {
  fireEvent.click(within(formulario).getByRole('button', { name: 'Agregar un cargo' }));
  const cargos = within(formulario).getAllByRole('group', { name: /^Cargo \d+$/ });
  const ultimo = cargos.at(-1);
  if (!ultimo) throw new Error('No apareció el cargo nuevo.');
  llenar(ultimo, cargo);
}
