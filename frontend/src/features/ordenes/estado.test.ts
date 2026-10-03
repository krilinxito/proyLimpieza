import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESTADOS_ORDEN } from '../../lib/dominio';
import { avancesDesde, estadoEfectivo, estaCerrada, ORIGENES, puedePasarA } from './estado';

/**
 * La tabla del backend, leída de su archivo de verdad: si alguien cambia las transiciones del
 * servidor sin cambiar las del dispositivo, el empleado vería botones que después el
 * servidor rechaza. Mismo truco que `lib/powersync/schema.test.ts` con las sync rules.
 */
function origenesDelBackend(): Record<string, string[]> {
  const fuente = readFileSync(resolve(import.meta.dirname, '../../../../backend/src/utils/dominio.ts'), 'utf8');
  const bloque = /const ORIGENES[^=]*=\s*\{([\s\S]*?)\};/.exec(fuente)?.[1] ?? '';
  return Object.fromEntries(
    [...bloque.matchAll(/(\w+):\s*\[([^\]]*)\]/g)].map(([, estado = '', lista = '']) => [
      estado,
      [...lista.matchAll(/'(\w+)'/g)].map(([, e = '']) => e),
    ]),
  );
}

describe('Avances de una orden iguales a los del backend — SPEC-KRILINXI-008', () => {
  it('lee la tabla del backend (si falla, cambió su formato)', () => {
    expect(Object.keys(origenesDelBackend()).sort()).toEqual([...ESTADOS_ORDEN].sort());
  });

  it('tiene exactamente la misma tabla de orígenes', () => {
    expect(ORIGENES).toEqual(origenesDelBackend());
  });
});

describe('Qué avances se ofrecen — SPEC-KRILINXI-008', () => {
  it.each([
    ['RECIBIDO', ['EN_PROCESO', 'LISTO']],
    ['EN_PROCESO', ['LISTO']],
    ['LISTO', []],
    ['ENTREGADO', []],
    ['ANULADO', []],
  ] as const)('desde %s ofrece %j', (actual, destinos) => {
    expect(avancesDesde(actual).map((a) => a.destino)).toEqual(destinos);
  });

  it('nunca se pasa a ENTREGADO por un avance: eso lo hace la entrega', () => {
    for (const actual of ESTADOS_ORDEN) expect(puedePasarA(actual, 'ENTREGADO')).toBe(false);
  });

  it('se anula desde cualquier estado abierto, y no desde uno cerrado', () => {
    expect((['RECIBIDO', 'EN_PROCESO', 'LISTO'] as const).every((e) => puedePasarA(e, 'ANULADO'))).toBe(true);
    expect(puedePasarA('ENTREGADO', 'ANULADO')).toBe(false);
    expect(puedePasarA('ANULADO', 'ANULADO')).toBe(false);
  });

  it('nunca retrocede', () => {
    expect(puedePasarA('LISTO', 'EN_PROCESO')).toBe(false);
    expect(puedePasarA('EN_PROCESO', 'RECIBIDO')).toBe(false);
  });
});

describe('El estado que se muestra — SPEC-KRILINXI-008', () => {
  it('con entrega en el dispositivo figura ENTREGADO, aunque la columna todavía diga LISTO', () => {
    expect(estadoEfectivo('LISTO', true)).toBe('ENTREGADO');
  });

  it('sin entrega, es el de la columna', () => {
    expect(estadoEfectivo('EN_PROCESO', false)).toBe('EN_PROCESO');
  });

  it('cerradas son ENTREGADO y ANULADO', () => {
    expect(ESTADOS_ORDEN.filter(estaCerrada)).toEqual(['ENTREGADO', 'ANULADO']);
  });
});
