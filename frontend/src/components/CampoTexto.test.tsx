import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CampoTexto, CampoTextoLargo } from './CampoTexto';

describe('CampoTexto — SPEC-KRILINXI-002', () => {
  it('muestra la etiqueta siempre visible y enlazada al input', () => {
    render(<CampoTexto etiqueta="Teléfono" value="70123456" onChange={() => {}} />);
    // getByLabelText solo encuentra el input si <label> y <input> están enlazados de verdad:
    // es como lo encontraría un lector de pantalla, o una persona que toca la etiqueta.
    const input = screen.getByLabelText('Teléfono');
    expect(input).toHaveValue('70123456');
    // Con el campo lleno, la etiqueta sigue en pantalla: un placeholder ya habría desaparecido.
    expect(screen.getByText('Teléfono')).toBeVisible();
  });

  it('entrega el texto escrito, no el evento', () => {
    const cambiar = vi.fn();
    render(<CampoTexto etiqueta="Nombre" value="" onChange={cambiar} />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Rosa' } });
    expect(cambiar).toHaveBeenCalledWith('Rosa');
  });

  it('muestra el error debajo y lo asocia al input para lectores de pantalla', () => {
    render(
      <CampoTexto etiqueta="Teléfono" value="" onChange={() => {}} error="Escribe el teléfono del cliente." />,
    );
    const input = screen.getByLabelText('Teléfono');
    expect(input).toHaveAccessibleDescription('Escribe el teléfono del cliente.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('sin error, el input no se marca inválido ni tiene descripción', () => {
    render(<CampoTexto etiqueta="Teléfono" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Teléfono');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAccessibleDescription();
  });

  it('dos campos en la misma pantalla no se confunden de etiqueta', () => {
    render(
      <>
        <CampoTexto etiqueta="Nombre" value="Rosa" onChange={() => {}} />
        <CampoTexto etiqueta="Teléfono" value="70123456" onChange={() => {}} error="Ya está usado." />
      </>,
    );
    expect(screen.getByLabelText('Nombre')).toHaveValue('Rosa');
    expect(screen.getByLabelText('Nombre')).not.toHaveAccessibleDescription();
    expect(screen.getByLabelText('Teléfono')).toHaveAccessibleDescription('Ya está usado.');
  });

  it('pasa al input los atributos de teclado, como el numérico para el teléfono', () => {
    render(<CampoTexto etiqueta="Teléfono" value="" onChange={() => {}} inputMode="numeric" />);
    expect(screen.getByLabelText('Teléfono')).toHaveAttribute('inputmode', 'numeric');
  });
});

describe('CampoTexto con el tema — SPEC-KRILINXI-022', () => {
  it('el error lleva el ícono de alerta, en el tono de peligro, y se sigue leyendo solo su texto', () => {
    render(<CampoTexto etiqueta="Teléfono" value="" onChange={() => {}} error="Escribe el teléfono del cliente." />);
    const input = screen.getByLabelText('Teléfono');
    expect(input).toHaveClass('border-peligro');
    expect(input).toHaveAccessibleDescription('Escribe el teléfono del cliente.');
    const error = screen.getByText('Escribe el teléfono del cliente.').closest('p');
    expect(error).toHaveClass('text-peligro-texto');
    expect(error?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('con teclado, el campo muestra el anillo de foco', () => {
    render(<CampoTexto etiqueta="Nombre" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Nombre')).toHaveClass('focus-visible:outline-foco', 'border-borde');
  });
});

describe('CampoTexto con el visto de "correcto" — SPEC-KRILINXI-058', () => {
  it('con correcto muestra un ícono y el texto "Correcto", enlazado al campo para el lector de pantalla', () => {
    render(<CampoTexto etiqueta="Teléfono" value="70123456" onChange={() => {}} correcto />);
    const input = screen.getByLabelText('Teléfono');

    expect(input).toHaveAccessibleDescription('Correcto');
    // El texto es solo para el lector de pantalla; a la vista queda el ícono (decorativo).
    expect(screen.getByText('Correcto')).toHaveClass('sr-only');
    expect(input.parentElement?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('sin correcto no muestra nada, como siempre', () => {
    render(<CampoTexto etiqueta="Teléfono" value="70123456" onChange={() => {}} />);
    expect(screen.queryByText('Correcto')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono')).not.toHaveAccessibleDescription();
  });

  it('un error manda sobre el visto: si hay error, no se muestra "Correcto"', () => {
    render(<CampoTexto etiqueta="Teléfono" value="1" onChange={() => {}} correcto error="Revisa el teléfono." />);
    expect(screen.queryByText('Correcto')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono')).toHaveAccessibleDescription('Revisa el teléfono.');
  });

  it('deja lugar al visto a la derecha, para que el texto no quede debajo del ícono', () => {
    render(<CampoTexto etiqueta="Teléfono" value="70123456" onChange={() => {}} correcto />);
    expect(screen.getByLabelText('Teléfono')).toHaveClass('pr-12');
  });
});

describe('CampoTextoLargo: varias líneas — SPEC-KRILINXI-058', () => {
  it('es un área de texto, con su etiqueta enlazada y al menos dos renglones', () => {
    render(<CampoTextoLargo etiqueta="Qué deja" value="" onChange={() => {}} />);
    const area = screen.getByLabelText('Qué deja');

    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveAttribute('rows', '2');
    expect(area).toHaveClass('min-h-24');
  });

  it('entrega el texto escrito con sus saltos de línea, no el evento', () => {
    const cambiar = vi.fn();
    render(<CampoTextoLargo etiqueta="Qué deja" value="" onChange={cambiar} />);
    fireEvent.change(screen.getByLabelText('Qué deja'), { target: { value: 'camisa\npantalón' } });
    expect(cambiar).toHaveBeenCalledWith('camisa\npantalón');
  });

  it('Enter pone un salto de línea y no envía el formulario donde está', () => {
    const enviar = vi.fn((evento: Event) => evento.preventDefault());
    render(
      <form onSubmit={(evento) => enviar(evento.nativeEvent)}>
        <CampoTextoLargo etiqueta="Qué deja" value="camisa" onChange={() => {}} />
      </form>,
    );
    // Un área de texto no es un campo que envía con Enter: la tecla no la intercepta nadie.
    const permitido = fireEvent.keyDown(screen.getByLabelText('Qué deja'), { key: 'Enter' });
    expect(permitido).toBe(true);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('comparte con el campo de una línea el error y el visto', () => {
    const { rerender } = render(<CampoTextoLargo etiqueta="Qué deja" value="" onChange={() => {}} error="Escribe qué deja." />);
    const area = screen.getByLabelText('Qué deja');
    expect(area).toHaveAccessibleDescription('Escribe qué deja.');
    expect(area).toHaveAttribute('aria-invalid', 'true');

    rerender(<CampoTextoLargo etiqueta="Qué deja" value="camisa" onChange={() => {}} correcto />);
    expect(screen.getByLabelText('Qué deja')).toHaveAccessibleDescription('Correcto');
  });

  it('no usa style={…} en el marcado: el alto lo pone el código, que la política de seguridad no bloquea', () => {
    render(<CampoTextoLargo etiqueta="Qué deja" value="camisa" onChange={() => {}} />);
    // jsdom no mide (scrollHeight es 0), pero el efecto corre: deja un alto puesto por el código sobre el elemento.
    expect(screen.getByLabelText('Qué deja').style.height).toBe('0px');
  });
});
