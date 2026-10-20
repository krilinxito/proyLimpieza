import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarrasHorizontales, type Barra } from './graficos/BarrasHorizontales';
import { Columnas } from './graficos/Columnas';
import { Grafico } from './graficos/Grafico';

/**
 * Las piezas de los gráficos, montadas solas — SPEC-KRILINXI-036. Viven fuera de `graficos/`
 * porque esa carpeta solo importa React (lo vigila el test de arquitectura de la 026).
 *
 * jsdom no pinta: no puede ver si un texto queda encima de otro ni si una barra tiene una costura.
 * Lo que sí ve es la estructura que lo evita, y eso es lo que se afirma acá. Que se vea bien es la
 * revisión a mano en Chrome (CLAUDE.md §4).
 */

const nada = () => {};

function barra(clave: string, ...valores: number[]): Barra {
  return {
    clave,
    etiqueta: clave,
    detalle: `Detalle de ${clave}`,
    tramos: valores.map((valor, i) => ({ clave: `serie-${i + 1}`, valor, clase: `fill-serie-${i + 1}` })),
  };
}

function dibujoDe(nombre: string) {
  // El SVG es aria-hidden: se busca dentro del botón de la barra, que sí tiene nombre.
  const svg = screen.getByRole('button', { name: nombre }).querySelector('svg');
  if (!svg) throw new Error(`La barra "${nombre}" no tiene dibujo`);
  return svg;
}

describe('La tabla para el lector de pantalla no se ve — SPEC-KRILINXI-036', () => {
  const tabla = { encabezados: ['Sucursal', 'Cobrado'], filas: [{ clave: 'c', celdas: ['Centro', 'Bs 10,00'] }] };

  it('el sr-only va en un contenedor alrededor de la tabla, no en la tabla', () => {
    render(
      <Grafico nombre="Cobrado por sucursal" vacio={false} pista="Tocá una barra" tabla={tabla}>
        {() => null}
      </Grafico>,
    );
    const laTabla = screen.getByRole('table', { name: 'Cobrado por sucursal' });
    expect(laTabla).not.toHaveClass('sr-only');
    expect(laTabla.parentElement).toHaveClass('sr-only');
  });

  it('el lector de pantalla sigue leyendo sus números', () => {
    render(
      <Grafico nombre="Cobrado por sucursal" vacio={false} pista="Tocá una barra" tabla={tabla}>
        {() => null}
      </Grafico>,
    );
    const fila = screen.getByRole('row', { name: /Centro/ });
    expect(within(fila).getByRole('cell')).toHaveTextContent('Bs 10,00');
  });
});

describe('Las barras sin costura — SPEC-KRILINXI-036', () => {
  it('una barra de un solo valor es una sola pieza, sin un segundo rectángulo que tape las esquinas', () => {
    render(<BarrasHorizontales barras={[barra('Centro', 40)]} maximo={40} elegir={nada} />);
    const svg = dibujoDe('Detalle de Centro');
    expect(svg.querySelectorAll('rect')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-barra]')).toHaveLength(1);
    expect(svg.querySelectorAll('line')).toHaveLength(0);
  });

  it('una apilada lleva un tramo por serie y un corte solo entre uno y otro', () => {
    render(<BarrasHorizontales barras={[barra('Centro', 10, 20, 30)]} maximo={60} elegir={nada} />);
    const svg = dibujoDe('Detalle de Centro');
    const tramos = [...svg.querySelectorAll('[data-tramo]')];
    const cortes = [...svg.querySelectorAll('[data-corte]')];
    expect(tramos).toHaveLength(3);
    expect(cortes).toHaveLength(2);
    // Cada corte cae justo donde empieza el tramo siguiente, y ningún tramo lleva borde propio.
    expect(cortes.map((c) => c.getAttribute('x1'))).toEqual(tramos.slice(1).map((t) => t.getAttribute('x')));
    for (const tramo of tramos) expect(tramo).not.toHaveAttribute('stroke-width');
  });

  it('un tramo en cero no deja un corte de más', () => {
    render(<BarrasHorizontales barras={[barra('Centro', 10, 0, 30)]} maximo={40} elegir={nada} />);
    const svg = dibujoDe('Detalle de Centro');
    expect(svg.querySelectorAll('[data-tramo]')).toHaveLength(2);
    expect(svg.querySelectorAll('[data-corte]')).toHaveLength(1);
  });

  it('una apilada que queda con un solo tramo se dibuja como barra común', () => {
    render(<BarrasHorizontales barras={[barra('Centro', 0, 25)]} maximo={25} elegir={nada} />);
    const svg = dibujoDe('Detalle de Centro');
    expect(svg.querySelectorAll('rect')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-corte]')).toHaveLength(0);
  });

  it('cada columna es una sola pieza', () => {
    const columnas = [
      { clave: 'a', valor: 3, eje: '14/10', detalle: '14/10: 3 boletas' },
      { clave: 'b', valor: 0, eje: '15/10', detalle: '15/10: 0 boletas' },
    ];
    render(<Columnas columnas={columnas} elegir={nada} />);
    expect(dibujoDe('14/10: 3 boletas').querySelectorAll('rect')).toHaveLength(1);
    // Un día en cero no dibuja nada: es un hueco sobre la línea de base.
    expect(dibujoDe('15/10: 0 boletas').querySelectorAll('rect')).toHaveLength(0);
  });
});
