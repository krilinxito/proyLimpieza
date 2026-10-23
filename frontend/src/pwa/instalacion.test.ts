import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  empezarAEscuchar,
  esIPhone,
  estadoDeInstalacion,
  estaInstalada,
  instalar,
  olvidarTodoParaPruebas,
  suscribirseALaInstalacion,
  type EventoDeInstalacion,
  type Ventana,
} from './instalacion';

/**
 * El aviso de instalación del navegador — SPEC-KRILINXI-059. Con una ventana de mentira: se le puede mandar el evento a mano y
 * elegir si dice que ya está instalada, sin un navegador de verdad.
 */
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';

function ventanaDePrueba(extras: { userAgent?: string; standalone?: boolean; displayStandalone?: boolean; maxTouchPoints?: number } = {}) {
  const oyentes = new Map<string, Set<(evento: Event) => void>>();
  const ventana: Ventana = {
    addEventListener: (tipo, oyente) => void (oyentes.get(tipo) ?? oyentes.set(tipo, new Set()).get(tipo))?.add(oyente),
    removeEventListener: (tipo, oyente) => void oyentes.get(tipo)?.delete(oyente),
    matchMedia: () => ({ matches: extras.displayStandalone === true }),
    navigator: { userAgent: extras.userAgent ?? ANDROID, standalone: extras.standalone, maxTouchPoints: extras.maxTouchPoints ?? 0 },
  };
  const disparar = (evento: Event) => oyentes.get(evento.type)?.forEach((oyente) => oyente(evento));
  return { ventana, disparar, cuantosOyentes: (tipo: string) => oyentes.get(tipo)?.size ?? 0 };
}

/** El evento que entrega Chrome, con un `prompt` y una respuesta de la persona. */
function ofertaDeChrome(respuesta: 'accepted' | 'dismissed' = 'accepted') {
  const evento = new Event('beforeinstallprompt', { cancelable: true }) as EventoDeInstalacion;
  evento.prompt = vi.fn(async () => undefined);
  evento.userChoice = Promise.resolve({ outcome: respuesta });
  return evento;
}

afterEach(() => olvidarTodoParaPruebas());

describe('Instalar la app: lo que dice el navegador — SPEC-KRILINXI-059', () => {
  it('sin ninguna oferta del navegador, no hay nada que mostrar', () => {
    const { ventana } = ventanaDePrueba();
    empezarAEscuchar(ventana);
    expect(estadoDeInstalacion(ventana)).toBe('nada');
  });

  it('cuando el navegador ofrece instalar, aparece el botón; y se le impide mostrar su propio cartel', () => {
    const { ventana, disparar } = ventanaDePrueba();
    empezarAEscuchar(ventana);
    const oferta = ofertaDeChrome();

    disparar(oferta);

    expect(estadoDeInstalacion(ventana)).toBe('se-puede');
    expect(oferta.defaultPrevented).toBe(true);
  });

  it('avisa a quien mira cuando cambia, y deja de avisar al darse de baja', () => {
    const { ventana, disparar } = ventanaDePrueba();
    empezarAEscuchar(ventana);
    const alCambiar = vi.fn();
    const baja = suscribirseALaInstalacion(alCambiar);

    disparar(ofertaDeChrome());
    expect(alCambiar).toHaveBeenCalledTimes(1);

    baja();
    disparar(ofertaDeChrome());
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  it('instalar muestra el cartel del navegador y dice qué contestó la persona; el botón desaparece enseguida', async () => {
    const { ventana, disparar } = ventanaDePrueba();
    empezarAEscuchar(ventana);
    const oferta = ofertaDeChrome('accepted');
    disparar(oferta);

    const pendiente = instalar();
    // El evento se puede usar una sola vez: se suelta antes de esperar la respuesta.
    expect(estadoDeInstalacion(ventana)).toBe('nada');
    expect(await pendiente).toBe('aceptada');
    expect(oferta.prompt).toHaveBeenCalledTimes(1);
  });

  it('si la persona dice que no, lo cuenta y no vuelve a ofrecer lo mismo', async () => {
    const { ventana, disparar } = ventanaDePrueba();
    empezarAEscuchar(ventana);
    disparar(ofertaDeChrome('dismissed'));

    expect(await instalar()).toBe('rechazada');
    expect(estadoDeInstalacion(ventana)).toBe('nada');
  });

  it('sin una oferta, instalar no hace nada', async () => {
    expect(await instalar()).toBe('no-disponible');
  });

  it('cuando se instala, el botón desaparece y no vuelve (evento appinstalled)', () => {
    const { ventana, disparar } = ventanaDePrueba();
    empezarAEscuchar(ventana);
    disparar(ofertaDeChrome());
    expect(estadoDeInstalacion(ventana)).toBe('se-puede');

    disparar(new Event('appinstalled'));

    expect(estadoDeInstalacion(ventana)).toBe('nada');
    expect(estaInstalada(ventana)).toBe(true);
  });

  it('si ya está abierta como app instalada (modo de pantalla standalone), no hay nada que ofrecer', () => {
    const { ventana, disparar } = ventanaDePrueba({ displayStandalone: true });
    empezarAEscuchar(ventana);
    disparar(ofertaDeChrome());
    expect(estadoDeInstalacion(ventana)).toBe('nada');
  });

  it('dejar de escuchar quita los dos oyentes', () => {
    const { ventana, cuantosOyentes } = ventanaDePrueba();
    const parar = empezarAEscuchar(ventana);
    expect(cuantosOyentes('beforeinstallprompt')).toBe(1);
    expect(cuantosOyentes('appinstalled')).toBe(1);

    parar();
    expect(cuantosOyentes('beforeinstallprompt')).toBe(0);
    expect(cuantosOyentes('appinstalled')).toBe(0);
  });

  it('una ventana sin matchMedia (un entorno sin pantalla) no revienta: no se considera instalada', () => {
    const { ventana } = ventanaDePrueba();
    const sinPantalla: Ventana = { ...ventana, matchMedia: undefined };
    expect(estaInstalada(sinPantalla)).toBe(false);
  });
});

describe('Instalar la app en iPhone — SPEC-KRILINXI-059', () => {
  it('Safari en iPhone no ofrece instalar: se muestra la ayuda de dos pasos', () => {
    const { ventana } = ventanaDePrueba({ userAgent: IPHONE });
    empezarAEscuchar(ventana);
    expect(estadoDeInstalacion(ventana)).toBe('ayuda-iphone');
  });

  it('un iPhone con la app ya instalada (navigator.standalone) no muestra nada', () => {
    const { ventana } = ventanaDePrueba({ userAgent: IPHONE, standalone: true });
    expect(estadoDeInstalacion(ventana)).toBe('nada');
  });

  it('reconoce iPhone, iPod y iPad, y un iPad nuevo que se presenta como Mac pero es táctil', () => {
    expect(esIPhone({ userAgent: IPHONE })).toBe(true);
    expect(esIPhone({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)' })).toBe(true);
    expect(esIPhone({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(true);
  });

  it('un Mac de escritorio y un Android no son iPhone', () => {
    expect(esIPhone({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe(false);
    expect(esIPhone({ userAgent: ANDROID })).toBe(false);
  });
});
