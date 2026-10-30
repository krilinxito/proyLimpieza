import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESTADOS_ORDEN } from '../../lib/dominio';
import { estadoDeLaBase, estadoEfectivo, estaCerrada, ORIGENES, puedePasarA, TONO_ESTADO } from './estado';

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

describe('Cambios de una orden iguales a los del backend — SPEC-KRILINXI-008 y SPEC-KRILINXI-067', () => {
  it('lee la tabla del backend (si falla, cambió su formato)', () => {
    expect(Object.keys(origenesDelBackend()).sort()).toEqual([...ESTADOS_ORDEN].sort());
  });

  it('tiene exactamente la misma tabla de orígenes', () => {
    expect(ORIGENES).toEqual(origenesDelBackend());
  });

  it('los estados cerrados son los mismos que en el backend', () => {
    const fuente = readFileSync(resolve(import.meta.dirname, '../../../../backend/src/utils/dominio.ts'), 'utf8');
    const lista = /ESTADOS_CERRADOS[^=]*=\s*\[([^\]]*)\]/.exec(fuente)?.[1] ?? '';
    const cerradosDelBackend = [...lista.matchAll(/'(\w+)'/g)].map(([, e = '']) => e);
    expect(ESTADOS_ORDEN.filter(estaCerrada)).toEqual(
      ESTADOS_ORDEN.filter((estado) => cerradosDelBackend.includes(estado)),
    );
  });
});

describe('Qué cambios se permiten — SPEC-KRILINXI-008 y SPEC-KRILINXI-067', () => {
  it('desde RECIBIDO solo se pasa a ANULADO; no hay pasos intermedios', () => {
    const destinos = ESTADOS_ORDEN.filter((destino) => puedePasarA('RECIBIDO', destino));
    expect(destinos).toEqual(['ANULADO']);
  });

  it('nunca se pasa a ENTREGADO ni a REEMBOLSADO por un cambio de estado: eso lo hace la entrega', () => {
    for (const actual of ESTADOS_ORDEN) {
      expect(puedePasarA(actual, 'ENTREGADO')).toBe(false);
      expect(puedePasarA(actual, 'REEMBOLSADO')).toBe(false);
    }
  });

  it('se anula una abierta, y no una cerrada', () => {
    expect(puedePasarA('RECIBIDO', 'ANULADO')).toBe(true);
    expect(puedePasarA('ENTREGADO', 'ANULADO')).toBe(false);
    expect(puedePasarA('REEMBOLSADO', 'ANULADO')).toBe(false);
    expect(puedePasarA('ANULADO', 'ANULADO')).toBe(false);
  });

  it('nunca se vuelve a RECIBIDO', () => {
    expect(puedePasarA('ANULADO', 'RECIBIDO')).toBe(false);
    expect(puedePasarA('ENTREGADO', 'RECIBIDO')).toBe(false);
  });
});

describe('El estado que se muestra — SPEC-KRILINXI-008', () => {
  it('con entrega en el dispositivo figura ENTREGADO, aunque la columna todavía diga RECIBIDO', () => {
    expect(estadoEfectivo('RECIBIDO', true)).toBe('ENTREGADO');
  });

  it('sin entrega, es el de la columna', () => {
    expect(estadoEfectivo('RECIBIDO', false)).toBe('RECIBIDO');
  });

  it('cerradas son ENTREGADO, REEMBOLSADO y ANULADO', () => {
    expect(ESTADOS_ORDEN.filter(estaCerrada)).toEqual(['ENTREGADO', 'REEMBOLSADO', 'ANULADO']);
  });
});

describe('Leer el estado guardado en la tablet — SPEC-KRILINXI-067', () => {
  it.each(['EN_PROCESO', 'LISTO'])('una boleta guardada como %s (de antes de la migración) se lee como RECIBIDO', (viejo) => {
    expect(estadoDeLaBase(viejo)).toBe('RECIBIDO');
  });

  it.each(ESTADOS_ORDEN)('%s se lee tal cual', (estado) => {
    expect(estadoDeLaBase(estado)).toBe(estado);
  });

  it.each([['PERDIDO'], [''], [null], [undefined], [3]])('%j no es un estado: da null', (valor) => {
    expect(estadoDeLaBase(valor)).toBeNull();
  });
});

describe('El tono de cada estado — SPEC-KRILINXI-025 y SPEC-KRILINXI-067', () => {
  // El tipo `Record<EstadoOrden, …>` ya obliga a TypeScript; esto lo dice también en la suite,
  // por si alguien agrega un estado al dominio y lo castea para salir del paso.
  it.each(ESTADOS_ORDEN)('%s tiene un tono', (estado) => {
    expect(['neutro', 'informacion', 'exito', 'advertencia', 'peligro']).toContain(TONO_ESTADO[estado]);
  });

  it('lo reembolsado y lo anulado van en rojo; lo demás, sin gritar', () => {
    expect(TONO_ESTADO.REEMBOLSADO).toBe('peligro');
    expect(TONO_ESTADO.ANULADO).toBe('peligro');
    expect(TONO_ESTADO.RECIBIDO).toBe('neutro');
    expect(TONO_ESTADO.ENTREGADO).toBe('neutro');
  });
});
