import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { App } from '../../../App';
import type { EstadoSubida } from '../../../lib/powersync';
import { controlFalso } from '../../../test/controlFalso';
import { sinJerga } from '../../../test/jerga';
import { renderEnRuta } from '../../../test/render';

/** Una base local que avisa `pendientes` registros sin subir. */
function conPendientes(pendientes: number) {
  const baseLocal = controlFalso();
  baseLocal.base.observarEstado.mockImplementation((alCambiar: (estado: EstadoSubida) => void) => {
    alCambiar({ conectado: false, pendientes, paraCorregir: 0 });
    return () => {};
  });
  return baseLocal;
}

async function pedirSalir() {
  fireEvent.click(await screen.findByRole('button', { name: 'Salir' }));
  return screen.getByRole('dialog');
}

describe('Salir con registros sin guardar — SPEC-KRILINXI-010', () => {
  it('con registros pendientes, el aviso dice cuántos se van a perder', async () => {
    renderEnRuta(<App />, '/', { baseLocal: conPendientes(3) });

    const aviso = await pedirSalir();

    expect(within(aviso).getByText(/Hay 3 registros que todavía no se guardaron en el sistema\. Si salís ahora, se van a perder\./)).toBeInTheDocument();
    sinJerga();
  });

  it('con uno solo, la frase va en singular', async () => {
    renderEnRuta(<App />, '/', { baseLocal: conPendientes(1) });

    const aviso = await pedirSalir();

    expect(within(aviso).getByText(/Hay 1 registro que todavía no se guardó en el sistema\. Si salís ahora, se va a perder\./)).toBeInTheDocument();
  });

  it('sin nada pendiente, el aviso es el de siempre', async () => {
    renderEnRuta(<App />, '/', { baseLocal: conPendientes(0) });

    const aviso = await pedirSalir();

    expect(within(aviso).getByText('Para volver a entrar vas a necesitar tu usuario, tu contraseña y conexión a internet.')).toBeInTheDocument();
    expect(within(aviso).queryByText(/se van? a perder/)).not.toBeInTheDocument();
  });
});
