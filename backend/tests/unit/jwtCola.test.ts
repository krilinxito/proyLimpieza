import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitirCredenciales, VENTANA_COLA_SEGUNDOS, verificarToken, verificarTokenDeLaCola } from '../../src/utils/jwt.js';
import { ID_DE_SESION, conTokenVencidoHace } from '../helpers/usuarios.js';

// Las dos verificaciones lado a lado: la de siempre y la de la cola del
// mostrador. El reloj falso fija "ahora", así el borde de los 3 días se prueba al
// segundo sin depender de cuánto tarda el test.

function token(cabecera: { Authorization: string }): string {
  return cabecera.Authorization.slice('Bearer '.length);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('La ventana de la cola en el token — SPEC-ALE186-018', () => {
  it('acepta un token vencido hace 3 días menos un segundo, y rechaza uno de 3 días más un segundo', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));

    const adentro = token(conTokenVencidoHace(VENTANA_COLA_SEGUNDOS - 1));
    const afuera = token(conTokenVencidoHace(VENTANA_COLA_SEGUNDOS + 1));

    expect(verificarTokenDeLaCola(adentro).id).toBe(ID_DE_SESION);
    expect(() => verificarTokenDeLaCola(afuera)).toThrow(expect.objectContaining({ status: 401 }));
  });

  it('la verificación de siempre no tiene ventana: vencido es vencido', () => {
    expect(() => verificarToken(token(conTokenVencidoHace(1)))).toThrow(expect.objectContaining({ status: 401 }));
  });

  it('la ventana no abre lo que nunca fue válido: ni una firma alterada ni un token de PowerSync', () => {
    const vencido = token(conTokenVencidoHace(60));
    const alterado = `${vencido.slice(0, -2)}xx`;
    const dePowerSync = emitirCredenciales({ id: ID_DE_SESION, rol: 'EMPLEADO', sucursalId: null }).tokenPowerSync;

    expect(() => verificarTokenDeLaCola(alterado)).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => verificarTokenDeLaCola(dePowerSync)).toThrow(expect.objectContaining({ status: 401 }));
  });
});
