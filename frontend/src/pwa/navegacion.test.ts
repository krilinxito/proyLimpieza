import { describe, expect, it } from 'vitest';
import { esPantallaDeLaApp } from './navegacion';

const APP = 'https://lavanderia.example';
const SERVIDORES = ['http://localhost:4000', 'http://localhost:8080'];

const abrir = (url: string) => ({ url, mode: 'navigate' });

describe('Service worker: qué es una pantalla de la app — SPEC-KRILINXI-011', () => {
  it.each(['/', '/ropa', '/cobrar?boleta=001234', '/para-corregir'])('abrir %s se responde con index.html', (ruta) => {
    expect(esPantallaDeLaApp(abrir(`${APP}${ruta}`), APP, SERVIDORES)).toBe(true);
  });

  it('un pedido que no es abrir una pantalla (un JS, un fetch) no lo atiende esta regla', () => {
    expect(esPantallaDeLaApp({ url: `${APP}/ropa`, mode: 'cors' }, APP, SERVIDORES)).toBe(false);
  });

  it.each([
    ['la API', 'http://localhost:4000/api/ordenes'],
    ['PowerSync', 'http://localhost:8080/sync/stream'],
    ['otro sitio', 'https://otro.example/ropa'],
  ])('nunca atiende %s, ni aunque se navegue hasta ahí', (_caso, url) => {
    expect(esPantallaDeLaApp(abrir(url), APP, SERVIDORES)).toBe(false);
    expect(esPantallaDeLaApp({ url, mode: 'cors' }, APP, SERVIDORES)).toBe(false);
  });

  describe('con la API en el mismo dominio que la app (detrás de un proxy)', () => {
    const MISMO = [`${APP}/api`, `${APP}/powersync`];

    it('lo que empieza con la dirección de la API o de PowerSync va a la red', () => {
      expect(esPantallaDeLaApp(abrir(`${APP}/api/health`), APP, MISMO)).toBe(false);
      expect(esPantallaDeLaApp(abrir(`${APP}/powersync`), APP, MISMO)).toBe(false);
    });

    it('una pantalla cuyo nombre solo se parece no se confunde con la API', () => {
      expect(esPantallaDeLaApp(abrir(`${APP}/apiladas`), APP, MISMO)).toBe(true);
    });
  });
});
