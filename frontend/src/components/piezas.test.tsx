import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Aviso, type TipoAviso } from './Aviso';
import { Insignia, type TonoInsignia } from './Insignia';
import { ESTILO_TARJETA, SenalTocable, Tarjeta } from './Tarjeta';

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

describe('Tarjeta: la que informa, la que destaca y la que se toca — SPEC-KRILINXI-037', () => {
  it('por defecto informa: liviana, sin sombra', () => {
    render(<Tarjeta titulo="Pagos">Todavía no pagó nada.</Tarjeta>);
    const tarjeta = screen.getByRole('region', { name: 'Pagos' });
    expect(tarjeta).toHaveClass('bg-superficie', 'border-borde-suave');
    expect(tarjeta.className).not.toMatch(/shadow/);
  });

  it('la que destaca un número va sobre el color suave de la marca, con su borde completo (SPEC-KRILINXI-052)', () => {
    render(
      <Tarjeta titulo="Cobrado hoy" tipo="destaca">
        Bs 120,00
      </Tarjeta>,
    );
    expect(screen.getByRole('region', { name: 'Cobrado hoy' })).toHaveClass('bg-marca-suave', 'border-2', 'border-marca');
    // Sin franja de un solo lado: se distingue por el fondo y el borde entero.
    expect(screen.getByRole('region', { name: 'Cobrado hoy' }).className).not.toMatch(/border-l-/);
  });

  it('las tres se distinguen por su forma, no solo por el color', () => {
    // Borde fino / franja gruesa / borde doble con sombra: lo que queda si se le quita el color.
    const forma = (clases: string) => clases.split(' ').filter((c) => /^(border(-2|-l-8)?|shadow-md)$/.test(c)).join(' ');
    const formas = Object.values(ESTILO_TARJETA).map(forma);
    expect(new Set(formas).size).toBe(3);
  });

  it('la señal de que se toca es una flecha decorativa: el nombre lo pone el texto de la tarjeta', () => {
    render(
      <button type="button" className={ESTILO_TARJETA.toca}>
        Boleta 001234
        <SenalTocable />
      </button>,
    );
    const boton = screen.getByRole('button', { name: 'Boleta 001234' });
    expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
