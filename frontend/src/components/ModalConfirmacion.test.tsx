import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModalConfirmacion } from './ModalConfirmacion';

/** El modal de anular una orden, que es el caso que describe CLAUDE.md §9. */
function renderAnular(abierto = true) {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  render(
    <ModalConfirmacion
      abierto={abierto}
      titulo="¿Anular la orden 001234?"
      mensaje="Esta acción no se puede deshacer."
      textoConfirmar="Sí, anular"
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
      peligroso
    />,
  );
  return { onConfirmar, onCancelar };
}

describe('ModalConfirmacion — SPEC-KRILINXI-002', () => {
  it('muestra la pregunta y qué va a pasar', () => {
    renderAnular();
    const dialogo = screen.getByRole('dialog', { name: '¿Anular la orden 001234?' });
    expect(dialogo).toHaveAccessibleDescription('Esta acción no se puede deshacer.');
  });

  it('ejecuta la acción solo al tocar confirmar', () => {
    const { onConfirmar, onCancelar } = renderAnular();
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, anular' }));
    expect(onConfirmar).toHaveBeenCalledOnce();
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('cancelar no ejecuta la acción', () => {
    const { onConfirmar, onCancelar } = renderAnular();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancelar).toHaveBeenCalledOnce();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('cerrarlo con Escape no ejecuta la acción', () => {
    const { onConfirmar, onCancelar } = renderAnular();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancelar).toHaveBeenCalledOnce();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('tocar fuera del cuadro lo cierra sin ejecutar la acción', () => {
    const { onConfirmar, onCancelar } = renderAnular();
    const fondo = screen.getByRole('dialog').parentElement;
    if (!fondo) throw new Error('el diálogo tiene que estar dentro de su fondo');
    fireEvent.click(fondo);
    expect(onCancelar).toHaveBeenCalledOnce();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('tocar dentro del cuadro no lo cierra', () => {
    const { onCancelar } = renderAnular();
    fireEvent.click(screen.getByText('Esta acción no se puede deshacer.'));
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('el foco empieza en Cancelar, para que un Enter apurado no confirme', () => {
    renderAnular();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('cerrado, no muestra nada ni escucha el teclado', () => {
    const { onCancelar } = renderAnular(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancelar).not.toHaveBeenCalled();
  });
});
