import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { App } from '../../App';
import { api } from '../../lib/api';
import { useBaseLocal } from '../../lib/powersync';
import { cuerpoError, simularApi } from '../../test/apiFalsa';
import { controlFalso } from '../../test/controlFalso';
import { renderEnRuta } from '../../test/render';
import { sesionDePrueba } from '../../test/sesion';

/** El token que el conector de PowerSync recibiría ahora mismo. */
function tokenQueEntrega(baseLocal: ReturnType<typeof controlFalso>): string | null {
  const obtenerToken = baseLocal.conectar.mock.calls.at(-1)?.[0];
  if (!obtenerToken) throw new Error('conectar no se llamó');
  return obtenerToken();
}

describe('Sesión y base local — SPEC-KRILINXI-004', () => {
  it('con sesión guardada, abre la base y se conecta con el token de PowerSync de esa sesión', async () => {
    const baseLocal = controlFalso();
    renderEnRuta(<App />, '/', { baseLocal, sesion: sesionDePrueba() });

    await waitFor(() => expect(baseLocal.conectar).toHaveBeenCalledOnce());
    // El de PowerSync, no el de la API: cada uno lo verifica un servidor distinto.
    expect(tokenQueEntrega(baseLocal)).toBe('token-powersync-de-prueba');
  });

  it('sin sesión no se conecta', async () => {
    const baseLocal = controlFalso();
    renderEnRuta(<App />, '/ingresar', { baseLocal, sesion: null });

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument();
    expect(baseLocal.conectar).not.toHaveBeenCalled();
  });

  it('al entrar se conecta con el token que acaba de llegar del login', async () => {
    simularApi(() => ({ status: 200, data: { ...sesionDePrueba(), tokenPowerSync: 'recien-emitido' } }));
    const baseLocal = controlFalso();
    renderEnRuta(<App />, '/ingresar', { baseLocal, sesion: null });

    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'elena' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(baseLocal.conectar).toHaveBeenCalledOnce());
    expect(tokenQueEntrega(baseLocal)).toBe('recien-emitido');
  });

  it('las pantallas tienen la base aunque la sincronización no termine nunca (sin internet)', async () => {
    const baseLocal = controlFalso();
    // Una conexión que no llega jamás: es lo que pasa sin internet.
    baseLocal.conectar.mockImplementation(() => new Promise<void>(() => {}));

    function LeeLaBase() {
      return <p>{useBaseLocal() ? 'base lista' : 'sin base'}</p>;
    }
    renderEnRuta(<LeeLaBase />, '/', { baseLocal });

    expect(await screen.findByText('base lista')).toBeInTheDocument();
  });
});

describe('Sesión y base local: borrar al irse — SPEC-KRILINXI-004', () => {
  it('al salir confirmando, desconecta y borra la base local', async () => {
    const baseLocal = controlFalso();
    renderEnRuta(<App />, '/', { baseLocal });
    await waitFor(() => expect(baseLocal.conectar).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(baseLocal.desconectarYBorrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, salir' }));

    await waitFor(() => expect(baseLocal.desconectarYBorrar).toHaveBeenCalledOnce());
  });

  it('cancelar la salida no borra nada', async () => {
    const baseLocal = controlFalso();
    renderEnRuta(<App />, '/', { baseLocal });
    await waitFor(() => expect(baseLocal.conectar).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(baseLocal.desconectarYBorrar).not.toHaveBeenCalled();
  });

  it('cuando la API rechaza la sesión (401), desconecta y borra la base local', async () => {
    simularApi(() => ({ status: 401, data: cuerpoError('NO_AUTENTICADO', 'Tu sesión venció.') }));
    const baseLocal = controlFalso();
    renderEnRuta(<App />, '/', { baseLocal });
    await waitFor(() => expect(baseLocal.conectar).toHaveBeenCalled());

    await act(() => api.get('/clientes').catch(() => {}));

    await waitFor(() => expect(baseLocal.desconectarYBorrar).toHaveBeenCalledOnce());
    expect(await screen.findByRole('heading', { name: 'Ingresar al sistema' })).toBeInTheDocument();
  });
});
