import { describe, expect, it } from 'vitest';
import { sistemaDePrueba } from '../test/sistemaDePrueba';
import { aplicarTema, guardarEleccion, leerEleccion, seguirAlSistema, temaVigente } from './tema';

const html = () => document.documentElement;

describe('Qué tema corresponde — SPEC-KRILINXI-030', () => {
  it('sin elección, sigue a la tablet: oscuro si lo prefiere, claro si no', () => {
    const sistema = sistemaDePrueba({ oscuro: true });
    expect(temaVigente()).toBe('oscuro');
    sistema.cambiar({ oscuro: false });
    expect(temaVigente()).toBe('claro');
  });

  it('sin matchMedia (un navegador viejo, jsdom) es claro', () => {
    expect(temaVigente()).toBe('claro');
  });

  it('lo elegido gana sobre la tablet, y se vuelve a leer: sobrevive a recargar', () => {
    sistemaDePrueba({ oscuro: true });
    guardarEleccion('claro');
    expect(leerEleccion()).toBe('claro');
    expect(temaVigente()).toBe('claro');
  });

  it('algo guardado que no es un tema se ignora', () => {
    localStorage.setItem('lavanderia.tema', 'rosado');
    expect(leerEleccion()).toBeNull();
  });

  it('aplicarlo lo marca en <html>, que es lo que lee index.css', () => {
    aplicarTema('oscuro');
    expect(html().dataset.tema).toBe('oscuro');
  });
});

describe('Seguir a la tablet en vivo — SPEC-KRILINXI-030', () => {
  it('avisa cuando la tablet cambia, mientras no haya elección', () => {
    const sistema = sistemaDePrueba({ oscuro: false });
    const vistos: string[] = [];
    seguirAlSistema((tema) => vistos.push(tema));
    sistema.cambiar({ oscuro: true });
    expect(vistos).toEqual(['oscuro']);
  });

  it('con una elección guardada, el sistema ya no manda', () => {
    const sistema = sistemaDePrueba({ oscuro: false });
    guardarEleccion('claro');
    const vistos: string[] = [];
    seguirAlSistema((tema) => vistos.push(tema));
    sistema.cambiar({ oscuro: true });
    expect(vistos).toEqual([]);
  });

  it('deja de escuchar cuando se le pide', () => {
    const sistema = sistemaDePrueba({ oscuro: false });
    const dejar = seguirAlSistema(() => {});
    dejar();
    expect(sistema.oyentes()).toBe(0);
  });
});
