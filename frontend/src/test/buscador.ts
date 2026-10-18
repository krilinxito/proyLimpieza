/**
 * Usar el buscador vivo en un test — SPEC-KRILINXI-032.
 *
 * El buscador busca solo, un rato después de dejar de escribir, y contra la base local: los
 * resultados no están en el acto. Estos helpers esperan lo que haga falta, así el test dice lo que
 * haría una persona ("escribo rosa y elijo a Rosa Quispe") y no cuánto hay que esperar:
 *
 *     await elegirEnBuscador('rosa', /Rosa Quispe/);           // el de clientes, por defecto
 *     await elegirEnBuscador('7012', 'Cliente nuevo');          // la acción fija también es una opción
 *     const campo = await escribirEnBuscador('zzz');            // solo escribir, para mirar qué dice
 *
 * El plazo es más largo que el de `findBy…` (1 s): a la demora del buscador se suma la primera
 * lectura de la base, que con la suite entera corriendo puede tardar (CLAUDE.md §4).
 */
import { expect } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const PLAZO = { timeout: 3000 };
const BUSCADOR_DE_CLIENTES = /Buscar cliente/;

/** Escribe en el buscador cuando ya se puede usar (la base local abierta). Devuelve el campo. */
export async function escribirEnBuscador(texto: string, etiqueta: string | RegExp = BUSCADOR_DE_CLIENTES) {
  const campo = await screen.findByRole('combobox', { name: etiqueta }, PLAZO);
  await waitFor(() => expect(campo).toBeEnabled(), PLAZO);
  fireEvent.change(campo, { target: { value: texto } });
  return campo;
}

/** Escribe y toca la opción que se llame así (un resultado, o la acción fija). */
export async function elegirEnBuscador(texto: string, opcion: string | RegExp, etiqueta?: string | RegExp) {
  await escribirEnBuscador(texto, etiqueta);
  fireEvent.click(await screen.findByRole('option', { name: opcion }, PLAZO));
}
