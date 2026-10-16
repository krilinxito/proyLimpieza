/**
 * Una tablet con el reloj corrido — SPEC-KRILINXI-012
 *
 * Congela el reloj de la tablet en HORA_DEL_SERVIDOR + `adelantoMs` y anota HORA_DEL_SERVIDOR
 * como lo que dijo el servidor en el último login. Así se prueba que una escritura lleve la
 * hora del servidor aunque la tablet esté mal:
 *
 *     tabletConRelojCorrido(10 * 60_000);      // 10 minutos adelantada
 *     await registrarRopa(...);
 *     expect(fila.fecha_entrada).toBe(HORA_DEL_SERVIDOR_ISO);
 *
 * Solo se falsea `Date`, no los timers: las promesas, SQLite y `waitFor` siguen andando. Se
 * restaura sola al terminar el test. `adelantoMs` negativo es una tablet atrasada.
 */
import { onTestFinished, vi } from 'vitest';
import { registrarHoraDelServidor } from '../lib/reloj';

export const HORA_DEL_SERVIDOR = Date.UTC(2026, 9, 16, 14, 5, 0);
export const HORA_DEL_SERVIDOR_ISO = new Date(HORA_DEL_SERVIDOR).toISOString();

export function tabletConRelojCorrido(adelantoMs: number, { medido = true } = {}): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HORA_DEL_SERVIDOR + adelantoMs);
  onTestFinished(() => {
    vi.useRealTimers();
  });
  if (medido) {
    const local = Date.now();
    registrarHoraDelServidor(HORA_DEL_SERVIDOR_ISO, { enviado: local, recibido: local });
  }
}
