import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EnlaceBoton } from './EnlaceBoton';

describe('EnlaceBoton — SPEC-KRILINXI-024', () => {
  it('es un enlace (no un botón) a la pantalla que se le dice, del tamaño de un botón', () => {
    render(
      <MemoryRouter>
        <EnlaceBoton a="/" icono="inicio">
          Volver al inicio
        </EnlaceBoton>
      </MemoryRouter>,
    );
    const enlace = screen.getByRole('link', { name: 'Volver al inicio' });
    expect(enlace).toHaveAttribute('href', '/');
    expect(enlace).toHaveClass('min-h-14', 'text-xl', 'bg-marca', 'focus-visible:outline-foco');
    expect(enlace.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
