import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Icono, NOMBRES_ICONOS } from './iconos';

describe('Íconos — SPEC-KRILINXI-022', () => {
  // Los que la spec nombra: los de cada pantalla y los del marco de la app.
  it('están los de todas las pantallas y los del marco', () => {
    expect(NOMBRES_ICONOS).toEqual(
      expect.arrayContaining([
        'inicio',
        'registrar-ropa',
        'ropa',
        'cobrar',
        'entregar',
        'clientes',
        'personal',
        'sucursales',
        'quien-hizo-que',
        'estadisticas',
        'menu',
        'cerrar',
        'salir',
        'alerta',
      ]),
    );
  });

  it.each(NOMBRES_ICONOS)('"%s" es un SVG decorativo: invisible para el lector de pantalla y sin style', (nombre) => {
    const { container } = render(<Icono nombre={nombre} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).not.toHaveAttribute('style');
    // Que dibuje algo: un nombre con los trazos vacíos sería un hueco en la pantalla.
    expect(svg?.childElementCount).toBeGreaterThan(0);
  });

  it('toma el color del texto que acompaña', () => {
    const { container } = render(<Icono nombre="cobrar" />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor');
  });
});
