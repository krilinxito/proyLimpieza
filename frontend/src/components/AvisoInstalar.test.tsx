import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { AvisoInstalar } from './AvisoInstalar';
import { empezarAEscuchar, olvidarTodoParaPruebas, type EventoDeInstalacion } from '../pwa/instalacion';
import { accionesPrincipales, usoDe } from '../test/jerarquia';
import { sinJerga } from '../test/jerga';

/**
 * El aviso para instalar la app — SPEC-KRILINXI-059. Se escucha en la ventana de jsdom y se le manda el evento del navegador a
 * mano, como lo haría Chrome: temprano, y una sola vez.
 */
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';

let parar: () => void = () => undefined;

beforeEach(() => {
  parar = empezarAEscuchar();
});
afterEach(() => {
  parar();
  olvidarTodoParaPruebas();
  vi.restoreAllMocks();
});

function ofrecerInstalar(respuesta: 'accepted' | 'dismissed' = 'accepted') {
  const evento = new Event('beforeinstallprompt', { cancelable: true }) as EventoDeInstalacion;
  evento.prompt = vi.fn(async () => undefined);
  evento.userChoice = Promise.resolve({ outcome: respuesta });
  act(() => {
    window.dispatchEvent(evento);
  });
  return evento;
}

describe('El aviso de instalar la app — SPEC-KRILINXI-059', () => {
  it('no aparece mientras el navegador no ofrezca instalar: un botón que no hace nada es peor que ninguno', () => {
    render(<AvisoInstalar />);
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar en este celular' })).not.toBeInTheDocument();
  });

  it('aparece con "Instalar en este celular" cuando el navegador lo ofrece, aunque el evento haya salido antes de montarse', () => {
    // El evento llega ANTES de que el aviso exista: por eso lo guarda el módulo y no el componente.
    ofrecerInstalar();
    render(<AvisoInstalar />);

    const aviso = screen.getByRole('region', { name: 'Instalar la app' });
    expect(within(aviso).getByRole('button', { name: 'Instalar en este celular' })).toBeInTheDocument();
    sinJerga();
  });

  it('también aparece si el evento llega con el aviso ya montado', () => {
    render(<AvisoInstalar />);
    expect(screen.queryByRole('button', { name: 'Instalar en este celular' })).not.toBeInTheDocument();

    ofrecerInstalar();
    expect(screen.getByRole('button', { name: 'Instalar en este celular' })).toBeInTheDocument();
  });

  it('al tocar el botón muestra el cartel del navegador, y el aviso desaparece', async () => {
    const evento = ofrecerInstalar('accepted');
    render(<AvisoInstalar />);

    fireEvent.click(screen.getByRole('button', { name: 'Instalar en este celular' }));

    expect(evento.prompt).toHaveBeenCalledTimes(1);
    await act(async () => undefined);
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });

  it('desaparece también cuando se instala por otro camino (evento appinstalled)', () => {
    ofrecerInstalar();
    render(<AvisoInstalar />);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });

  it('"Ahora no" lo esconde, sin instalar nada', () => {
    const evento = ofrecerInstalar();
    render(<AvisoInstalar />);

    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));

    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
    expect(evento.prompt).not.toHaveBeenCalled();
  });

  it('no suma una segunda acción principal a la pantalla: los dos botones son secundarios', () => {
    ofrecerInstalar();
    // `accionesPrincipales` busca dentro del <main> de la pantalla.
    render(
      <main>
        <AvisoInstalar />
      </main>,
    );

    expect(usoDe(screen.getByRole('button', { name: 'Instalar en este celular' }))).toBe('secundario');
    expect(usoDe(screen.getByRole('button', { name: 'Ahora no' }))).toBe('secundario');
    expect(accionesPrincipales()).toEqual([]);
  });
});

describe('El aviso de instalar en iPhone — SPEC-KRILINXI-059', () => {
  beforeEach(() => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
  });

  it('explica en dos pasos, con palabras, y sin botón de instalar (Safari no lo permite)', () => {
    render(<AvisoInstalar />);

    const aviso = screen.getByRole('region', { name: 'Instalar la app' });
    const pasos = within(aviso).getAllByRole('listitem');
    expect(pasos).toHaveLength(2);
    expect(pasos[0]).toHaveTextContent('Toca el botón Compartir');
    expect(pasos[1]).toHaveTextContent('Agregar a pantalla de inicio');
    expect(within(aviso).queryByRole('button', { name: 'Instalar en este celular' })).not.toBeInTheDocument();
    sinJerga();
  });

  it('"Ahora no" también lo esconde', () => {
    render(<AvisoInstalar />);
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });
});
