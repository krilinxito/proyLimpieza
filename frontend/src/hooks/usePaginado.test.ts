import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { cambiarAnchoDePantalla, conAnchoDePantalla } from '../test/pantalla';
import { usePaginado } from './usePaginado';

const numeros = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('Partir una lista en páginas — SPEC-KRILINXI-041', () => {
  it('muestra solo lo que entra en una página del tamaño de la pantalla', () => {
    conAnchoDePantalla(500);
    const { result } = renderHook(() => usePaginado(numeros(14)));

    expect(result.current).toMatchObject({ visibles: [1, 2, 3, 4, 5, 6], pagina: 1, total: 14, porPagina: 6 });
  });

  it('pasar de página muestra las siguientes, y la última puede traer menos', () => {
    conAnchoDePantalla(500);
    const { result } = renderHook(() => usePaginado(numeros(14)));

    act(() => result.current.irAPagina(3));

    expect(result.current.visibles).toEqual([13, 14]);
    expect(result.current.pagina).toBe(3);
  });

  it('una lista que entra en una página es una sola, sin nada que paginar', () => {
    const { result } = renderHook(() => usePaginado(numeros(5)));

    expect(result.current.visibles).toEqual(numeros(5));
    expect(result.current.total).toBeLessThanOrEqual(result.current.porPagina);
  });

  it('mientras la lista se está leyendo (null) no inventa una vacía', () => {
    const { result } = renderHook(() => usePaginado<number>(null));

    expect(result.current).toMatchObject({ visibles: null, total: 0, pagina: 1 });
  });

  it('cambiar lo que reinicia (el filtro) vuelve a la primera página', () => {
    conAnchoDePantalla(500);
    const { result, rerender } = renderHook(({ filtro }) => usePaginado(numeros(14), filtro), {
      initialProps: { filtro: 'a' },
    });
    act(() => result.current.irAPagina(3));
    expect(result.current.pagina).toBe(3);

    rerender({ filtro: 'b' });

    // Ya en ese mismo render, sin pasar primero por la página vieja.
    expect(result.current.pagina).toBe(1);
  });

  it('con el mismo filtro y la lista que se vuelve a leer, se queda en su página', () => {
    conAnchoDePantalla(500);
    const { result, rerender } = renderHook(({ lista }) => usePaginado(lista, 'a'), { initialProps: { lista: numeros(14) } });
    act(() => result.current.irAPagina(2));

    rerender({ lista: numeros(14) });

    expect(result.current.pagina).toBe(2);
  });

  it('si la lista se achica y la página ya no existe, muestra la última que tenga', () => {
    conAnchoDePantalla(500);
    const { result, rerender } = renderHook(({ lista }) => usePaginado(lista, 'a'), { initialProps: { lista: numeros(13) } });
    act(() => result.current.irAPagina(3));
    expect(result.current.visibles).toEqual([13]);

    // Se descartó el único de la última página: ahora son 12, dos páginas.
    rerender({ lista: numeros(12) });

    expect(result.current.pagina).toBe(2);
    expect(result.current.visibles).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it('si la lista queda vacía, vuelve a la página 1 en vez de quedar en una que no existe', () => {
    conAnchoDePantalla(500);
    const { result, rerender } = renderHook(({ lista }) => usePaginado(lista, 'a'), { initialProps: { lista: numeros(7) } });
    act(() => result.current.irAPagina(2));

    rerender({ lista: [] });

    expect(result.current).toMatchObject({ pagina: 1, visibles: [], total: 0 });
  });

  it('si la pantalla cambia de tamaño, se ajusta y vuelve a la primera página', () => {
    conAnchoDePantalla(500);
    const { result } = renderHook(() => usePaginado(numeros(25)));
    act(() => result.current.irAPagina(3));
    expect(result.current).toMatchObject({ pagina: 3, porPagina: 6 });

    cambiarAnchoDePantalla(1200);

    // La página 3 de a 6 no es la página 3 de a 20.
    expect(result.current).toMatchObject({ pagina: 1, porPagina: 20 });
    expect(result.current.visibles).toHaveLength(20);
  });
});
