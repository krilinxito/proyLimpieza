import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ResultadosDeBusqueda } from '../lib/texto';
import { BuscadorVivo } from './BuscadorVivo';

type Persona = { id: string; nombre: string };
const ROSA: Persona = { id: '1', nombre: 'Rosa Quispe' };
const ROSARIO: Persona = { id: '2', nombre: 'Rosario Mamani' };

/** Una respuesta que el test decide cuándo llega: para probar el orden de las respuestas. */
function respuestaPendiente() {
  let resolver: (r: ResultadosDeBusqueda<Persona>) => void = () => {};
  const promesa = new Promise<ResultadosDeBusqueda<Persona>>((r) => {
    resolver = r;
  });
  return { promesa, llega: (resultados: Persona[]) => resolver({ resultados, hayMas: false }) };
}

function montar({
  buscar = vi.fn(async (_texto: string) => ({ resultados: [ROSA, ROSARIO], hayMas: false })),
  demoraMs = 0,
}: { buscar?: (texto: string) => Promise<ResultadosDeBusqueda<Persona>>; demoraMs?: number } = {}) {
  const alElegir = vi.fn();
  const alNuevo = vi.fn();
  render(
    <BuscadorVivo<Persona>
      etiqueta="Buscar cliente"
      buscar={buscar}
      claveDe={(p) => p.id}
      mostrar={(p) => p.nombre}
      alElegir={alElegir}
      accion={{ texto: 'Cliente nuevo', alElegir: alNuevo }}
      sinResultados="Ningún cliente coincide con eso."
      demoraMs={demoraMs}
    />,
  );
  const campo = screen.getByRole('combobox', { name: 'Buscar cliente' });
  const escribir = (texto: string) => fireEvent.change(campo, { target: { value: texto } });
  return { buscar, alElegir, alNuevo, campo, escribir };
}

const opciones = () => within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);

describe('Buscador mientras se escribe — SPEC-KRILINXI-032', () => {
  it('con una sola letra no busca; con dos, muestra los resultados sin tocar ningún botón', async () => {
    const { buscar, escribir } = montar();
    escribir('r');
    await new Promise((r) => setTimeout(r, 20));
    expect(buscar).not.toHaveBeenCalled();

    escribir('ro');
    await waitFor(() => expect(opciones()).toEqual(['Rosa Quispe', 'Rosario Mamani', 'Cliente nuevo']));
    expect(buscar).toHaveBeenCalledWith('ro');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('espera a que se deje de escribir: escribir rápido busca una sola vez, lo último', () => {
    vi.useFakeTimers();
    try {
      const { buscar, escribir } = montar({ demoraMs: 300 });
      escribir('ro');
      act(() => vi.advanceTimersByTime(100));
      escribir('ros');
      act(() => vi.advanceTimersByTime(100));
      escribir('rosa');
      act(() => vi.advanceTimersByTime(300));
      expect(buscar).toHaveBeenCalledTimes(1);
      expect(buscar).toHaveBeenCalledWith('rosa');
    } finally {
      vi.useRealTimers();
    }
  });

  it('una respuesta vieja que llega tarde no pisa a la nueva', async () => {
    const vieja = respuestaPendiente();
    const nueva = respuestaPendiente();
    const buscar = vi.fn((texto: string) => (texto === 'ro' ? vieja.promesa : nueva.promesa));
    const { escribir } = montar({ buscar });

    escribir('ro');
    await waitFor(() => expect(buscar).toHaveBeenCalledWith('ro'));
    escribir('rosario');
    await waitFor(() => expect(buscar).toHaveBeenCalledWith('rosario'));

    await act(async () => nueva.llega([ROSARIO]));
    await act(async () => vieja.llega([ROSA, ROSARIO]));
    expect(opciones()).toEqual(['Rosario Mamani', 'Cliente nuevo']);
  });

  it('cuenta los resultados para el lector de pantalla, y avisa si hay más', async () => {
    const { escribir } = montar({ buscar: async () => ({ resultados: [ROSA, ROSARIO], hayMas: true }) });
    escribir('ro');
    // La región viva existe desde el principio, vacía: se espera el texto, no solo que aparezca.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('2 resultados. Hay más resultados: escribe un poco más.'),
    );
    expect(screen.getByText('Hay más resultados: escribe un poco más.', { selector: 'p:not([role])' })).toBeInTheDocument();
  });

  it('sin resultados lo dice, y la acción fija sigue ahí', async () => {
    const { escribir } = montar({ buscar: async () => ({ resultados: [], hayMas: false }) });
    escribir('zzz');
    expect(await screen.findByText('Ningún cliente coincide con eso.', { selector: 'p:not([role])' })).toBeInTheDocument();
    expect(opciones()).toEqual(['Cliente nuevo']);
  });

  it('la acción fija está visible antes de escribir, y recibe lo escrito', async () => {
    const { alNuevo, escribir } = montar({ buscar: async () => ({ resultados: [], hayMas: false }) });
    expect(opciones()).toEqual(['Cliente nuevo']);
    escribir('  Rosa nueva ');
    fireEvent.click(screen.getByRole('option', { name: 'Cliente nuevo' }));
    expect(alNuevo).toHaveBeenCalledWith('Rosa nueva');
  });

  it('se elige tocando la tarjeta', async () => {
    const { alElegir, escribir } = montar();
    escribir('ro');
    fireEvent.click(await screen.findByRole('option', { name: 'Rosario Mamani' }));
    expect(alElegir).toHaveBeenCalledWith(ROSARIO);
  });

  it('con el teclado: las flechas mueven la opción activa sin sacar el foco, Enter elige', async () => {
    const { alElegir, campo, escribir } = montar();
    campo.focus();
    escribir('ro');
    await screen.findByRole('option', { name: 'Rosa Quispe' });

    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    const rosario = screen.getByRole('option', { name: 'Rosario Mamani' });
    expect(campo).toHaveAttribute('aria-activedescendant', rosario.id);
    expect(rosario).toHaveAttribute('aria-selected', 'true');
    expect(campo).toHaveFocus();

    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(alElegir).toHaveBeenCalledWith(ROSARIO);
  });

  it('las flechas también llegan a la acción fija', async () => {
    const { alNuevo, campo, escribir } = montar();
    escribir('ro');
    await screen.findByRole('option', { name: 'Rosa Quispe' });
    for (let i = 0; i < 5; i++) fireEvent.keyDown(campo, { key: 'ArrowDown' });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(alNuevo).toHaveBeenCalledWith('ro');
  });

  it('Escape borra lo escrito', async () => {
    const { campo, escribir } = montar();
    escribir('ro');
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(campo).toHaveValue('');
  });

  it('si la búsqueda falla, lo dice en palabras', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { escribir } = montar({ buscar: async () => Promise.reject(new Error('rota')) });
    escribir('ro');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo buscar.');
  });

  it('es un combobox que controla su lista, con el patrón de ARIA', () => {
    const { campo } = montar();
    expect(campo).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(campo).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('Enter sin una opción elegida queda cancelado: no envía el formulario donde está (SPEC-KRILINXI-034)', () => {
    const { campo } = montar();
    // jsdom no envía formularios con Enter, así que no sirve mirar si se envió. Se mira lo que en
    // un navegador lo impide: que el Enter quede cancelado. `fireEvent` devuelve false en ese caso.
    expect(fireEvent.keyDown(campo, { key: 'Enter' })).toBe(false);
  });
});
