/**
 * Palabras del sistema que no pueden aparecer en el mostrador — SPEC-KRILINXI-006
 *
 * CLAUDE.md §9: "Registrar ropa", no "Crear orden"; nada de "sincronizar", "caché" o
 * "token" en pantalla. Nació en SPEC-KRILINXI-005 dentro del test de clientes y se mudó
 * aquí cuando la segunda pantalla la necesitó.
 *
 *     import { sinJerga } from '../../../test/jerga';
 *     await buscar('70123456');
 *     sinJerga();                 // revisa todo lo que hay en pantalla en este momento
 *
 * Llamala en CADA paso de la pantalla, no solo al abrirla: los textos que fallan suelen
 * ser los de los pasos del final (un aviso de éxito, un error), que nadie mira dos veces.
 */
import { expect } from 'vitest';

export const JERGA = /sincroniz|cach[eé]|token|\bAPI\b|servidor|base de datos|SQL|UUID|\bórden(es)?\b|\borden(es)?\b/i;

export function sinJerga(): void {
  expect(document.body.textContent).not.toMatch(JERGA);
}
