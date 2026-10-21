/**
 * El ancho de la pantalla en los tests — SPEC-KRILINXI-041
 *
 * Cuántas filas entran en una página depende del ancho (`lib/tamanoDePagina.ts`), y jsdom es una
 * pantalla ancha de 1024px: 20 por página. Para probar que una lista se parte en páginas sin sembrar
 * 21 filas, el test pone una pantalla angosta (500px → 6 por página, 800px → 10):
 *
 *     conAnchoDePantalla(500);
 *     // ... renderEnRuta(...): la lista mostrará 6 y dirá "Página 1 de 2" si hay 7
 *
 *     cambiarAnchoDePantalla(1200);      // la tablet se gira: avisa a quien escucha `resize`
 *
 * Se restaura sola al terminar el test.
 */
import { act } from '@testing-library/react';
import { onTestFinished } from 'vitest';

function poner(ancho: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: ancho });
}

export function conAnchoDePantalla(ancho: number): void {
  const original = window.innerWidth;
  poner(ancho);
  onTestFinished(() => poner(original));
}

/** Cambia el ancho con la pantalla ya abierta y avisa del cambio, como cuando se gira una tablet. */
export function cambiarAnchoDePantalla(ancho: number): void {
  poner(ancho);
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}
