import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CampoTexto } from './CampoTexto';

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
      <CampoTexto etiqueta="Teléfono" value="" onChange={() => {}} error="Escribí el teléfono del cliente." />,
    );
    const input = screen.getByLabelText('Teléfono');
    expect(input).toHaveAccessibleDescription('Escribí el teléfono del cliente.');
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
