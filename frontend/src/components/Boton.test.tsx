import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Boton } from './Boton';

/**
 * Una promesa que el test resuelve cuando quiere. Sirve para congelar el botón a mitad de
 * su acción y comprobar qué pasa mientras está ocupado.
 */
function promesaControlada() {
  let resolver: () => void = () => {};
  const promesa = new Promise<void>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

describe('Boton — SPEC-KRILINXI-002', () => {
  it('se renderiza con texto grande y área de toque amplia', () => {
    render(<Boton>Cobrar</Boton>);
    const boton = screen.getByRole('button', { name: 'Cobrar' });
    // Las clases, no los píxeles: jsdom no calcula los estilos de Tailwind (ver estilos.test.tsx).
    expect(boton).toHaveClass('text-xl', 'min-h-14', 'w-full');
  });

  it('ejecuta su acción al tocarlo', () => {
    const accion = vi.fn();
    render(<Boton onClick={accion}>Cobrar</Boton>);
    fireEvent.click(screen.getByRole('button', { name: 'Cobrar' }));
    expect(accion).toHaveBeenCalledOnce();
  });

  it('un doble toque no dispara la acción dos veces mientras está en curso', async () => {
    const { promesa, resolver } = promesaControlada();
    const accion = vi.fn(() => promesa);
    render(<Boton onClick={accion}>Cobrar</Boton>);
    const boton = screen.getByRole('button', { name: 'Cobrar' });

    fireEvent.click(boton);
    fireEvent.click(boton);

    expect(accion).toHaveBeenCalledOnce();
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');

    // Cuando la acción termina, vuelve a estar disponible.
    resolver();
    await waitFor(() => expect(boton).toBeEnabled());
  });

  it('si la acción falla, se vuelve a habilitar y no se traga el error', async () => {
    // Manejar el error es trabajo de quien pasa la acción (mostrar "no se pudo cobrar").
    // Si se le escapa uno, el botón no lo esconde: sale como rechazo sin manejar, que es lo
    // que la consola y cualquier monitoreo ven. Aquí se escucha ese rechazo para comprobar
    // que existe, en vez de dejar que Vitest lo reporte como error suelto.
    const escapados = vi.fn();
    process.on('unhandledRejection', escapados);
    const accion = vi.fn(() => Promise.reject(new Error('sin conexión')));

    render(<Boton onClick={accion}>Cobrar</Boton>);
    const boton = screen.getByRole('button', { name: 'Cobrar' });
    fireEvent.click(boton);

    await waitFor(() => expect(boton).toBeEnabled());
    await waitFor(() => expect(escapados).toHaveBeenCalledWith(new Error('sin conexión'), expect.anything()));
    process.off('unhandledRejection', escapados);
  });

  it('se deshabilita cuando se lo marca ocupado desde fuera, y muestra su texto de espera', () => {
    render(
      <Boton type="submit" ocupado textoOcupado="Guardando…">
        Guardar
      </Boton>,
    );
    const boton = screen.getByRole('button', { name: 'Guardando…' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('type', 'submit');
  });

  it('no ejecuta nada si está deshabilitado', () => {
    const accion = vi.fn();
    render(
      <Boton onClick={accion} disabled>
        Cobrar
      </Boton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cobrar' }));
    expect(accion).not.toHaveBeenCalled();
  });
});

describe('Boton con el tema — SPEC-KRILINXI-022', () => {
  it('con teclado muestra un anillo de foco', () => {
    render(<Boton>Cobrar</Boton>);
    expect(screen.getByRole('button', { name: 'Cobrar' })).toHaveClass('focus-visible:outline-3', 'focus-visible:outline-foco');
  });

  it('deshabilitado se distingue por algo más que el color: el borde punteado y el cursor', () => {
    render(<Boton disabled>Cobrar</Boton>);
    expect(screen.getByRole('button', { name: 'Cobrar' })).toHaveClass('disabled:border-dashed', 'disabled:cursor-not-allowed');
  });

  it.each(['primario', 'secundario', 'peligro'] as const)('la variante %s mantiene el alto y el texto grandes', (variante) => {
    render(<Boton variante={variante}>Cobrar</Boton>);
    expect(screen.getByRole('button', { name: 'Cobrar' })).toHaveClass('min-h-14', 'text-xl');
  });

  it('con ícono, el nombre del botón sigue siendo solo su texto', () => {
    render(<Boton icono="cobrar">Cobrar</Boton>);
    const boton = screen.getByRole('button', { name: 'Cobrar' });
    expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('el ícono se queda mientras está ocupado, y el texto cambia al de espera', () => {
    render(
      <Boton icono="cobrar" ocupado textoOcupado="Cobrando…">
        Cobrar
      </Boton>,
    );
    const boton = screen.getByRole('button', { name: 'Cobrando…' });
    expect(boton.querySelector('svg')).not.toBeNull();
  });
});

/**
 * La jerarquía — SPEC-KRILINXI-037. jsdom no pinta, así que se comprueba lo que hace distinta a cada
 * variante por su FORMA, no solo por su color: lleno, con borde, con ícono de alerta, o sin caja y
 * subrayado. Si dos variantes solo se distinguieran por el color, estos tests no podrían separarlas.
 */
describe('Boton: cuatro usos y un tamaño compacto — SPEC-KRILINXI-037', () => {
  it('el principal es lleno, de todo el ancho', () => {
    render(<Boton>Registrar ropa</Boton>);
    expect(screen.getByRole('button', { name: 'Registrar ropa' })).toHaveClass('bg-marca', 'shadow-sm', 'w-full');
  });

  it('el secundario es con borde, sobre la superficie', () => {
    render(<Boton variante="secundario">Cobrar</Boton>);
    const boton = screen.getByRole('button', { name: 'Cobrar' });
    expect(boton).toHaveClass('border-borde', 'bg-superficie');
    expect(boton).not.toHaveClass('bg-marca');
  });

  it('el de peligro lleva siempre el ícono de alerta, aunque no se le pase', () => {
    render(<Boton variante="peligro">Anular</Boton>);
    const boton = screen.getByRole('button', { name: 'Anular' });
    expect(boton).toHaveClass('bg-peligro');
    expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('el de navegación no tiene caja: subrayado, del ancho de su texto y con la flecha de volver', () => {
    render(<Boton variante="navegacion">Volver a la lista</Boton>);
    const boton = screen.getByRole('button', { name: 'Volver a la lista' });
    expect(boton).toHaveClass('underline', 'bg-transparent', 'border-transparent', 'w-auto', 'text-marca');
    expect(boton).not.toHaveClass('w-full');
    expect(boton.querySelector('svg')).not.toBeNull();
  });

  it('el compacto es más bajo y del ancho de su texto, pero sigue siendo de dedo (48px)', () => {
    render(
      <Boton variante="secundario" tamano="compacto">
        Cobrar
      </Boton>,
    );
    const boton = screen.getByRole('button', { name: 'Cobrar' });
    expect(boton).toHaveClass('min-h-12', 'text-lg', 'w-auto');
    expect(boton).not.toHaveClass('min-h-14', 'w-full');
  });

  it('un botón deshabilitado no reacciona al pasarle por encima', () => {
    render(<Boton disabled>Cobrar</Boton>);
    const clases = screen.getByRole('button', { name: 'Cobrar' }).className.split(' ');
    expect(clases.filter((c) => c.startsWith('hover:'))).toEqual([]);
  });
});
