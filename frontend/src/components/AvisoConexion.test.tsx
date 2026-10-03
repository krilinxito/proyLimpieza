import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sinJerga } from '../test/jerga';
import { AvisoConexion } from './AvisoConexion';

function mostrar(conectado: boolean, pendientes: number, paraCorregir = 0) {
  render(
    <MemoryRouter>
      <AvisoConexion conectado={conectado} pendientes={pendientes} paraCorregir={paraCorregir} />
    </MemoryRouter>,
  );
  return screen.getByRole('status');
}

describe('Aviso de conexión — SPEC-KRILINXI-007', () => {
  it.each<[string, boolean, number, string]>([
    ['sin internet y con 3 pendientes', false, 3, 'Trabajando sin internet — 3 registros se guardarán cuando vuelva la conexión.'],
    ['sin internet y con 1 pendiente', false, 1, 'Trabajando sin internet — 1 registro se guardará cuando vuelva la conexión.'],
    ['sin internet y nada pendiente', false, 0, 'Trabajando sin internet — lo que registres se guardará cuando vuelva la conexión.'],
    ['con internet y guardando', true, 2, 'Con internet — guardando 2 registros…'],
    ['con internet y todo guardado', true, 0, 'Con internet — todo está guardado.'],
  ])('%s lo dice en palabras', (_caso, conectado, pendientes, frase) => {
    expect(mostrar(conectado, pendientes)).toHaveTextContent(frase);
    sinJerga();
  });

  it('si hay registros para corregir, lo dice y lleva a revisarlos', () => {
    mostrar(true, 0, 2);
    const enlace = screen.getByRole('link', { name: '2 registros no se pudieron guardar. Tocá acá para revisarlos.' });
    expect(enlace).toHaveAttribute('href', '/para-corregir');
    sinJerga();
  });

  it('con uno solo, la frase va en singular', () => {
    mostrar(false, 0, 1);
    expect(screen.getByRole('link')).toHaveTextContent('1 registro no se pudo guardar.');
  });

  it('sin nada para corregir, no hay enlace', () => {
    mostrar(true, 0, 0);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
