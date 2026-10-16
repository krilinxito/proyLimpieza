import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { conectarSesion } from '../../lib/api';
import { cuerpoError, simularApi, type RespuestaFalsa } from '../../test/apiFalsa';
import { jwtDePrueba, sesionDePrueba } from '../../test/sesion';
import { crearRenovador } from './renovacion';
import type { Sesion } from './types';

const AHORA = Date.UTC(2026, 9, 16, 12, 0, 0);
const MINUTO = 60_000;

/**
 * Arma un renovador sobre una sesión en memoria, con la hora fija en AHORA, y le presta esa
 * sesión a `lib/api` como hace `SesionProvider`: así el pedido sale con el token de verdad y
 * un 401 avisa el rechazo por el mismo camino que en la app.
 */
function preparar(tokenPowerSync: string, responder: () => RespuestaFalsa) {
  let sesion: Sesion | null = { ...sesionDePrueba(), token: 'token-api-viejo', tokenPowerSync };
  const rechazada = vi.fn(() => {
    sesion = null;
  });
  onTestFinished(conectarSesion({ obtenerToken: () => sesion?.token ?? null, alRechazarSesion: rechazada }));
  const servidor = simularApi(responder);
  const guardar = vi.fn((nueva: Sesion) => {
    sesion = nueva;
  });
  const tokenPowerSyncVigente = crearRenovador({ leerSesion: () => sesion, guardarSesion: guardar, ahora: () => AHORA });
  return { tokenPowerSyncVigente, servidor, guardar, rechazada, sesion: () => sesion };
}

const RENOVADA = { ...sesionDePrueba({ nombreCompleto: 'Elena Renovada' }), token: 'token-api-nuevo', tokenPowerSync: 'ps-nuevo' };
const OK: RespuestaFalsa = { status: 200, data: { ...RENOVADA, ahora: new Date(AHORA).toISOString() } };

describe('Renovar el token de PowerSync: cuándo — SPEC-KRILINXI-010', () => {
  it('con más de 2 minutos por delante devuelve el guardado y no llama a la API', async () => {
    const vigente = jwtDePrueba(AHORA + 2 * MINUTO + 1000);
    const { tokenPowerSyncVigente, servidor } = preparar(vigente, () => OK);

    expect(await tokenPowerSyncVigente()).toBe(vigente);
    expect(servidor.pedidos).toHaveLength(0);
  });

  it.each([
    ['vencido', jwtDePrueba(AHORA - MINUTO)],
    ['a punto de vencer (menos de 2 minutos)', jwtDePrueba(AHORA + MINUTO)],
    ['sin un exp que se pueda leer', 'esto-no-es-un-jwt'],
  ])('%s: renueva con el token de la API y devuelve el nuevo', async (_caso, token) => {
    const { tokenPowerSyncVigente, servidor } = preparar(token, () => OK);

    expect(await tokenPowerSyncVigente()).toBe('ps-nuevo');
    expect(servidor.pedidos).toEqual([
      // El de la API, no el de PowerSync: /renovar lo verifica nuestro backend.
      expect.objectContaining({ metodo: 'POST', ruta: '/auth/renovar', autorizacion: 'Bearer token-api-viejo' }),
    ]);
  });

  it('sin nadie adentro devuelve null y no llama a la API', async () => {
    const servidor = simularApi(() => OK);
    const tokenPowerSyncVigente = crearRenovador({ leerSesion: () => null, guardarSesion: vi.fn() });

    expect(await tokenPowerSyncVigente()).toBeNull();
    expect(servidor.pedidos).toHaveLength(0);
  });
});

describe('Renovar el token de PowerSync: qué queda guardado — SPEC-KRILINXI-010', () => {
  it('guarda el par nuevo y el usuario releído', async () => {
    const { tokenPowerSyncVigente, guardar } = preparar(jwtDePrueba(AHORA - MINUTO), () => OK);

    await tokenPowerSyncVigente();

    expect(guardar).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ token: 'token-api-nuevo', tokenPowerSync: 'ps-nuevo', usuario: RENOVADA.usuario }),
    );
  });

  it.each([
    ['sin conexión', 'sin-conexion' as const],
    ['con el servidor caído (5xx)', { status: 503, data: cuerpoError('SIN_BASE', 'No disponible.') }],
  ])('%s: lanza para que PowerSync reintente, y la sesión queda como estaba', async (_caso, respuesta) => {
    const vencido = jwtDePrueba(AHORA - MINUTO);
    const { tokenPowerSyncVigente, guardar, rechazada, sesion } = preparar(vencido, () => respuesta);

    await expect(tokenPowerSyncVigente()).rejects.toThrow();

    expect(guardar).not.toHaveBeenCalled();
    expect(rechazada).not.toHaveBeenCalled();
    expect(sesion()?.tokenPowerSync).toBe(vencido);
  });

  it('con 401 la sesión se da por rechazada y devuelve null: PowerSync no se conecta', async () => {
    const { tokenPowerSyncVigente, guardar, rechazada } = preparar(jwtDePrueba(AHORA - MINUTO), () => ({
      status: 401,
      data: cuerpoError('NO_AUTENTICADO', 'Tu cuenta fue dada de baja.'),
    }));

    expect(await tokenPowerSyncVigente()).toBeNull();
    expect(rechazada).toHaveBeenCalledOnce();
    expect(guardar).not.toHaveBeenCalled();
  });

  it('si alguien salió mientras se renovaba, la respuesta no resucita la sesión', async () => {
    let sesion: Sesion | null = { ...sesionDePrueba(), tokenPowerSync: jwtDePrueba(AHORA - MINUTO) };
    const guardar = vi.fn();
    const tokenPowerSyncVigente = crearRenovador({
      leerSesion: () => sesion,
      guardarSesion: guardar,
      renovar: async () => {
        sesion = null; // tocó "Salir" mientras el pedido estaba en camino
        return RENOVADA;
      },
      ahora: () => AHORA,
    });

    expect(await tokenPowerSyncVigente()).toBeNull();
    expect(guardar).not.toHaveBeenCalled();
  });
});

describe('Renovar el token de PowerSync: una sola vez a la vez — SPEC-KRILINXI-010', () => {
  it('varios pedidos simultáneos con el token por vencer hacen una sola llamada a /renovar', async () => {
    const { tokenPowerSyncVigente, servidor, guardar } = preparar(jwtDePrueba(AHORA + MINUTO), () => OK);

    const tokens = await Promise.all([tokenPowerSyncVigente(), tokenPowerSyncVigente(), tokenPowerSyncVigente()]);

    expect(tokens).toEqual(['ps-nuevo', 'ps-nuevo', 'ps-nuevo']);
    expect(servidor.pedidos).toHaveLength(1);
    expect(guardar).toHaveBeenCalledOnce();
  });

  it('terminada una renovación, la siguiente vuelve a decidir con el token nuevo', async () => {
    const { tokenPowerSyncVigente, servidor } = preparar(jwtDePrueba(AHORA - MINUTO), () => ({
      status: 200,
      data: { ...RENOVADA, tokenPowerSync: jwtDePrueba(AHORA + 12 * 60 * MINUTO) },
    }));

    await tokenPowerSyncVigente();
    await tokenPowerSyncVigente();

    // El segundo ya encuentra uno vigente: no vuelve a la API.
    expect(servidor.pedidos).toHaveLength(1);
  });
});
