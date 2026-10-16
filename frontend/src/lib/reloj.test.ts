import { describe, expect, it, vi } from 'vitest';
import { HORA_DEL_SERVIDOR, HORA_DEL_SERVIDOR_ISO, tabletConRelojCorrido } from '../test/reloj';
import { conHoraDelServidor, desfaseDelReloj, horaOficial, registrarHoraDelServidor } from './reloj';

const MINUTO = 60_000;
const CLAVE = 'lavanderia.desfaseReloj';

describe('Reloj de la tablet: medir el desfase — SPEC-KRILINXI-012', () => {
  it('guarda la hora del servidor menos la de la tablet, comparando con la mitad del viaje', () => {
    // El pedido salió 10 min antes de la hora del servidor y tardó 2 s: la mitad del viaje es
    // a los 10 min - 1 s, así que la tablet va 10 min - 1 s atrasada.
    const enviado = HORA_DEL_SERVIDOR - 10 * MINUTO - 1000;
    registrarHoraDelServidor(HORA_DEL_SERVIDOR_ISO, { enviado, recibido: enviado + 2000 });
    expect(desfaseDelReloj()).toBe(10 * MINUTO);
  });

  it('queda en el dispositivo: sobrevive a recargar la página', () => {
    registrarHoraDelServidor(HORA_DEL_SERVIDOR_ISO, { enviado: HORA_DEL_SERVIDOR - 5000, recibido: HORA_DEL_SERVIDOR - 5000 });
    // Recargar es volver a leer el almacenamiento: no hay nada en memoria que se pierda.
    expect(localStorage.getItem(CLAVE)).toBe('5000');
    expect(desfaseDelReloj()).toBe(5000);
  });

  it.each([
    ['sin ahora', undefined],
    ['con un ahora que no es fecha', 'mañana a la tarde'],
    ['con un ahora que no es texto', 1_760_000_000],
    ['con null', null],
  ])('%s no cambia el desfase guardado', (_caso, ahora) => {
    registrarHoraDelServidor(HORA_DEL_SERVIDOR_ISO, { enviado: HORA_DEL_SERVIDOR - 3000, recibido: HORA_DEL_SERVIDOR - 3000 });

    registrarHoraDelServidor(ahora, { enviado: 0, recibido: 0 });

    expect(desfaseDelReloj()).toBe(3000);
  });

  it('un valor guardado que no es número se trata como sin medir', () => {
    localStorage.setItem(CLAVE, 'basura');
    expect(desfaseDelReloj()).toBe(0);
  });
});

describe('Reloj de la tablet: la hora oficial — SPEC-KRILINXI-012', () => {
  it('es la hora de la tablet más el desfase, en ISO 8601 UTC', () => {
    tabletConRelojCorrido(10 * MINUTO);
    expect(horaOficial()).toBe(HORA_DEL_SERVIDOR_ISO);
  });

  it('con la tablet atrasada también corrige', () => {
    tabletConRelojCorrido(-3 * MINUTO);
    expect(horaOficial()).toBe(HORA_DEL_SERVIDOR_ISO);
  });

  it('sin desfase medido, es la hora de la tablet', () => {
    tabletConRelojCorrido(10 * MINUTO, { medido: false });
    expect(horaOficial()).toBe(new Date(HORA_DEL_SERVIDOR + 10 * MINUTO).toISOString());
  });

  it('sigue corrigiendo con el paso del tiempo: el desfase es una diferencia, no una hora fija', () => {
    tabletConRelojCorrido(10 * MINUTO);
    vi.setSystemTime(HORA_DEL_SERVIDOR + 10 * MINUTO + 90_000);
    expect(horaOficial()).toBe(new Date(HORA_DEL_SERVIDOR + 90_000).toISOString());
  });
});

describe('Reloj de la tablet: cronometrar el pedido — SPEC-KRILINXI-012', () => {
  it('anota el ahora de la respuesta y la devuelve sin tocarla', async () => {
    tabletConRelojCorrido(10 * MINUTO, { medido: false });
    const respuesta = { token: 't', ahora: HORA_DEL_SERVIDOR_ISO };

    expect(await conHoraDelServidor(async () => respuesta)).toBe(respuesta);
    expect(desfaseDelReloj()).toBe(-10 * MINUTO);
  });

  it('una respuesta sin ahora no anota nada', async () => {
    await conHoraDelServidor(async () => ({ token: 't' }));
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  it('si el pedido falla, el error sigue de largo y no se anota nada', async () => {
    await expect(conHoraDelServidor(() => Promise.reject(new Error('sin conexión')))).rejects.toThrow('sin conexión');
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });
});
