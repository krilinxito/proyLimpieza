import { screen, within } from '@testing-library/react';

/**
 * Para comprobar la jerarquía visual de una pantalla — SPEC-KRILINXI-037.
 *
 * jsdom no pinta nada, así que no se puede "mirar" qué botón resalta. Lo que sí se puede es leer
 * con qué estilo se armó cada uno (`components/estilosBoton.ts`): cada uso deja una clase que lo
 * delata. Con eso, un test dice "en esta pantalla hay una sola acción principal" en una línea:
 *
 *     expect(accionesPrincipales()).toEqual(['Registrar ropa']);
 *     expect(usoDe(screen.getByRole('button', { name: 'Volver a la lista' }))).toBe('navegacion');
 *
 * Las pantallas que adopten la jerarquía en sus propias specs usan estos dos, en vez de repetir
 * nombres de clases en cada test.
 */
export type Uso = 'primario' | 'secundario' | 'peligro' | 'navegacion';

/** El uso de un botón o enlace con aspecto de botón, por su clase; null si no es ninguno de los cuatro. */
export function usoDe(elemento: HTMLElement): Uso | null {
  const clases = elemento.classList;
  if (clases.contains('bg-marca')) return 'primario';
  if (clases.contains('bg-peligro')) return 'peligro';
  if (clases.contains('underline') && clases.contains('bg-transparent')) return 'navegacion';
  if (clases.contains('border-borde') && clases.contains('bg-superficie')) return 'secundario';
  return null;
}

/**
 * Los nombres de las acciones principales (botones o enlaces llenos de la marca) a la vista, dentro
 * del contenido de la pantalla: el menú y la cabecera del marco no cuentan, son de todas.
 */
export function accionesPrincipales(dentro: HTMLElement = screen.getByRole('main')): string[] {
  return [...within(dentro).queryAllByRole('button'), ...within(dentro).queryAllByRole('link')]
    .filter((elemento) => usoDe(elemento) === 'primario')
    .map((elemento) => elemento.textContent?.trim() ?? '');
}
