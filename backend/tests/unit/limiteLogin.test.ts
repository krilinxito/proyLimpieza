import { describe, expect, it } from 'vitest';
import { BLOQUEO_MS, MAXIMO_FALLOS, crearLimitador } from '../../src/services/limiteLogin.js';

// El servicio solo, con un reloj que el test mueve a mano: `crearLimitador`
// recibe el reloj justamente para esto. Así se prueban 5 minutos sin esperarlos.
function conReloj() {
  let t = 0;
  return {
    limitador: crearLimitador(() => t),
    avanzar: (ms: number) => {
      t += ms;
    },
  };
}

describe('Límite de intentos: el servicio — SPEC-ALE186-016', () => {
  it('bloquea al llegar al máximo de fallos seguidos, y no antes', () => {
    const { limitador } = conReloj();
    for (let i = 0; i < MAXIMO_FALLOS - 1; i++) limitador.registrarFallo('maria');
    expect(limitador.segundosDeBloqueo('maria')).toBeNull();

    limitador.registrarFallo('maria');

    expect(limitador.segundosDeBloqueo('maria')).toBe(300);
  });

  it('cuenta los segundos que faltan hacia arriba, y libera justo a los 5 minutos', () => {
    const { limitador, avanzar } = conReloj();
    for (let i = 0; i < MAXIMO_FALLOS; i++) limitador.registrarFallo('maria');

    avanzar(BLOQUEO_MS - 1);
    expect(limitador.segundosDeBloqueo('maria')).toBe(1);
    avanzar(1);
    expect(limitador.segundosDeBloqueo('maria')).toBeNull();
  });

  it('al terminar el bloqueo devuelve los 5 intentos enteros', () => {
    const { limitador, avanzar } = conReloj();
    for (let i = 0; i < MAXIMO_FALLOS; i++) limitador.registrarFallo('maria');
    avanzar(BLOQUEO_MS);
    expect(limitador.segundosDeBloqueo('maria')).toBeNull();

    limitador.registrarFallo('maria');

    expect(limitador.segundosDeBloqueo('maria')).toBeNull();
  });

  it('olvida los nombres sin bloqueo ni fallos recientes: la memoria no crece sin límite', () => {
    const { limitador, avanzar } = conReloj();
    for (let i = 0; i < 1000; i++) limitador.registrarFallo(`inventado-${i}`);
    expect(limitador.cantidad()).toBe(1000);

    avanzar(BLOQUEO_MS);
    limitador.segundosDeBloqueo('cualquiera');

    expect(limitador.cantidad()).toBe(0);
  });

  it('no olvida a quien sigue bloqueado aunque haya pasado tiempo desde su último fallo', () => {
    const { limitador, avanzar } = conReloj();
    for (let i = 0; i < MAXIMO_FALLOS; i++) limitador.registrarFallo('maria');

    avanzar(BLOQUEO_MS / 2);
    limitador.segundosDeBloqueo('otro');

    expect(limitador.segundosDeBloqueo('maria')).toBe(150);
  });

  it('entrar bien lo olvida enseguida', () => {
    const { limitador } = conReloj();
    for (let i = 0; i < MAXIMO_FALLOS - 1; i++) limitador.registrarFallo('maria');

    limitador.registrarExito('maria');

    expect(limitador.cantidad()).toBe(0);
  });
});
