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
