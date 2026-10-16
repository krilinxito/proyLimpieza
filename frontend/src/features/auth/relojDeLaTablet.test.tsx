import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { App } from '../../App';
import { desfaseDelReloj } from '../../lib/reloj';
import { simularApi } from '../../test/apiFalsa';
import { renderEnRuta } from '../../test/render';
import { HORA_DEL_SERVIDOR, HORA_DEL_SERVIDOR_ISO, tabletConRelojCorrido } from '../../test/reloj';
import { sesionDePrueba } from '../../test/sesion';
import { renovar } from './api/renovar';

const DIEZ_MINUTOS = 10 * 60_000;
const CON_HORA = { status: 200, data: { ...sesionDePrueba(), ahora: HORA_DEL_SERVIDOR_ISO } };

describe('La hora del servidor llega con la sesión — SPEC-KRILINXI-012', () => {
  it('al entrar, la tablet anota cuánto se desfasa su reloj', async () => {
    tabletConRelojCorrido(DIEZ_MINUTOS, { medido: false });
    simularApi(() => CON_HORA);
    renderEnRuta(<App />, '/ingresar', { sesion: null });

    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'elena' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(desfaseDelReloj()).toBe(-DIEZ_MINUTOS));
  });

  it('al renovar la sesión, vuelve a medir', async () => {
    tabletConRelojCorrido(DIEZ_MINUTOS);
    // El servidor ahora dice 2 minutos más tarde de lo esperado: la tablet se atrasó un poco.
    simularApi(() => ({ status: 200, data: { ...sesionDePrueba(), ahora: new Date(HORA_DEL_SERVIDOR + 120_000).toISOString() } }));

    await renovar();

    expect(desfaseDelReloj()).toBe(-DIEZ_MINUTOS + 120_000);
  });

  it('salir no borra el desfase: es de la tablet, no de la persona', async () => {
    tabletConRelojCorrido(DIEZ_MINUTOS);
    renderEnRuta(<App />, '/');

    fireEvent.click(await screen.findByRole('button', { name: 'Salir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, salir' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar al sistema' })).toBeInTheDocument();
    expect(desfaseDelReloj()).toBe(-DIEZ_MINUTOS);
  });
});
