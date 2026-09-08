/**
 * Helper de test compartido — SPEC-KRILINXI-001
 *
 * Casi toda pantalla de este proyecto usa enlaces o lee la ruta actual, y eso revienta si
 * se renderiza suelta: React Router necesita un Router por encima. `MemoryRouter` es uno
 * que guarda la ruta en memoria en vez de en la barra del navegador, que es justo lo que
 * hace falta en un test.
 *
 * Úsalo en vez de `render()` de Testing Library:
 *
 *     renderEnRuta(<App />, '/cobrar');
 */
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

export function renderEnRuta(ui: ReactElement, ruta = '/') {
  return render(<MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>);
}
