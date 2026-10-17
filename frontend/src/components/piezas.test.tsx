import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Aviso, type TipoAviso } from './Aviso';
import { Insignia, type TonoInsignia } from './Insignia';
import { Tarjeta } from './Tarjeta';

describe('Aviso — SPEC-KRILINXI-022', () => {
  it.each<[TipoAviso, 'alert' | 'status']>([
    ['error', 'alert'],
    ['advertencia', 'alert'],
    ['informacion', 'status'],
    ['exito', 'status'],
  ])('el de %s usa role="%s" y dice su texto', (tipo, rol) => {
    render(<Aviso tipo={tipo}>No se pudo guardar. Probá de nuevo.</Aviso>);
    expect(screen.getByRole(rol)).toHaveTextContent('No se pudo guardar. Probá de nuevo.');
  });

  it('el ícono es decorativo: lo que se lee es el texto', () => {
    render(<Aviso tipo="error">Ese teléfono ya está usado.</Aviso>);
    const aviso = screen.getByRole('alert');
    expect(aviso.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(aviso).toHaveAccessibleName('');
  });

  it('cada tipo tiene su tono', () => {
    render(
      <>
        <Aviso tipo="error">Mal</Aviso>
        <Aviso tipo="exito">Bien</Aviso>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveClass('bg-peligro-fondo', 'text-peligro-texto');
    expect(screen.getByRole('status')).toHaveClass('bg-exito-fondo', 'text-exito-texto');
  });
});

describe('Tarjeta — SPEC-KRILINXI-022', () => {
  it('con título es una sección con ese nombre y su encabezado', () => {
    render(
      <Tarjeta titulo="Datos del cliente">
        <p>Rosa Quispe</p>
      </Tarjeta>,
    );
    const seccion = screen.getByRole('region', { name: 'Datos del cliente' });
    expect(seccion).toHaveTextContent('Rosa Quispe');
    expect(screen.getByRole('heading', { name: 'Datos del cliente' })).toBeInTheDocument();
  });

  it('dentro de otra sección, el título puede ser un h3 (SPEC-KRILINXI-025)', () => {
    render(
      <Tarjeta titulo="Cuentas" nivel={3}>
        <p>Bs 30,00</p>
      </Tarjeta>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Cuentas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cuentas' })).toBeInTheDocument();
  });

  it('sin título es solo un recuadro, sin sección que anunciar', () => {
    render(
      <Tarjeta>
        <p>Rosa Quispe</p>
      </Tarjeta>,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByText('Rosa Quispe').parentElement).toHaveClass('bg-superficie');
  });
});

describe('Insignia — SPEC-KRILINXI-022', () => {
  it.each<[TonoInsignia, string]>([
    ['neutro', 'bg-fondo'],
    ['informacion', 'bg-info-fondo'],
    ['exito', 'bg-exito-fondo'],
    ['advertencia', 'bg-advertencia-fondo'],
    ['peligro', 'bg-peligro-fondo'],
  ])('con tono %s se pinta con su fondo y el texto siempre está', (tono, fondo) => {
    render(<Insignia tono={tono}>Lista para entregar</Insignia>);
    expect(screen.getByText('Lista para entregar')).toHaveClass(fondo);
  });
});
