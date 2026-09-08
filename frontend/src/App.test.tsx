import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { App } from './App';
import { RUTAS } from './pages/rutas';
import { renderEnRuta } from './test/render';

describe('App — SPEC-001', () => {
  it('muestra el menú del mostrador en la ruta raíz', () => {
    renderEnRuta(<App />, '/');
    expect(screen.getByRole('heading', { name: 'Lavandería' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar ropa' })).toBeInTheDocument();
  });

  it('muestra una pantalla en español cuando la dirección no existe', () => {
    renderEnRuta(<App />, '/esta-ruta-no-existe');
    expect(screen.getByRole('heading', { name: 'Esa página no existe' })).toBeInTheDocument();
  });

  // Recorre el propio registro: si alguien añade una ruta sin pantalla, este test lo caza.
  it.each(RUTAS.map((r) => [r.camino, r.titulo]))(
    'la ruta %s responde con su pantalla',
    (camino, titulo) => {
      renderEnRuta(<App />, camino);
      const esperado = camino === '/' ? 'Lavandería' : titulo;
      expect(screen.getByRole('heading', { name: esperado })).toBeInTheDocument();
    },
  );
});
