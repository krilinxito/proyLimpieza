import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCIONES_AUDITORIA,
  ESTADOS_ABIERTOS,
  ESTADOS_CERRADOS,
  ESTADOS_ORDEN,
  METODOS_PAGO,
  MOMENTOS_ITEM,
  TIPOS_PAGO,
  TIPOS_RETIRO,
  esEstadoOrden,
  estadosDeOrigen,
} from '../../src/utils/dominio.js';

/**
 * Los ENUM leídos del schema, que es la fuente de verdad: la línea base congelada y, encima, lo que cambian las migraciones
 * (SPEC-KRILINXI-055: `005_quitar_transferencia.sql` recrea `metodo_pago` sin un valor). Un `CREATE TYPE` posterior pisa al anterior.
 */
function enumsDelSchema(): Map<string, string[]> {
  const raiz = resolve(import.meta.dirname, '../../..');
  const carpeta = resolve(raiz, 'backend/migraciones');
  const archivos = [
    resolve(raiz, 'context/lavanderia_schema.sql'),
    ...readdirSync(carpeta)
      .filter((nombre) => /^\d{3}_.+\.sql$/.test(nombre))
      .sort()
      .map((nombre) => resolve(carpeta, nombre)),
  ];
  const enums = new Map<string, string[]>();
  for (const ruta of archivos) {
    const sql = readFileSync(ruta, 'utf8');
    for (const [, nombre = '', valores = ''] of sql.matchAll(/CREATE TYPE (\w+)\s+AS ENUM \(([^)]*)\)/g)) {
      enums.set(nombre, [...valores.matchAll(/'([^']+)'/g)].map(([, v = '']) => v));
    }
  }
  return enums;
}

describe('Dominio: los ENUM del schema — SPEC-ALE186-004', () => {
  const enums = enumsDelSchema();

  it.each([
    ['estado_orden', ESTADOS_ORDEN],
    ['tipo_retiro', TIPOS_RETIRO],
    ['tipo_pago', TIPOS_PAGO],
    ['metodo_pago', METODOS_PAGO],
    ['momento_item', MOMENTOS_ITEM],
  ])('%s tiene exactamente los mismos valores que el código', (nombre, lista) => {
    expect(enums.get(nombre)).toEqual([...lista]);
  });

  it('reconoce un estado válido y rechaza uno mal escrito', () => {
    expect(esEstadoOrden('REEMBOLSADO')).toBe(true);
    expect(esEstadoOrden('RECIBIDO ')).toBe(false);
    expect(esEstadoOrden(undefined)).toBe(false);
  });
});

describe('Dominio: los estados de la boleta — SPEC-KRILINXI-067', () => {
  it('la migración 006 deja estado_orden con cuatro valores y el código dice lo mismo', () => {
    expect(enumsDelSchema().get('estado_orden')).toEqual(['RECIBIDO', 'ENTREGADO', 'REEMBOLSADO', 'ANULADO']);
    expect([...ESTADOS_ORDEN]).toEqual(['RECIBIDO', 'ENTREGADO', 'REEMBOLSADO', 'ANULADO']);
  });

  it('EN_PROCESO y LISTO ya no existen', () => {
    expect(esEstadoOrden('EN_PROCESO')).toBe(false);
    expect(esEstadoOrden('LISTO')).toBe(false);
  });

  it('lo que ya salió o se anuló está cerrado, y REEMBOLSADO también', () => {
    expect([...ESTADOS_CERRADOS]).toEqual(['ENTREGADO', 'REEMBOLSADO', 'ANULADO']);
  });
});

describe('Dominio: las acciones de auditoría — SPEC-ALE186-010', () => {
  it('accion_auditoria tiene exactamente los mismos valores que el código', () => {
    expect(enumsDelSchema().get('accion_auditoria')).toEqual([...ACCIONES_AUDITORIA]);
  });
});

describe('Dominio: cómo cambia una orden — SPEC-ALE186-004 y SPEC-KRILINXI-067', () => {
  it('desde RECIBIDO solo se puede pasar a ANULADO', () => {
    expect(estadosDeOrigen('ANULADO', false)).toEqual(['RECIBIDO', 'ANULADO']);
  });

  it('no se vuelve a RECIBIDO desde un estado cerrado', () => {
    expect(estadosDeOrigen('RECIBIDO', false)).toEqual(['RECIBIDO']);
  });

  it('una orden entregada o reembolsada no se anula', () => {
    expect(estadosDeOrigen('ANULADO', false)).not.toContain('ENTREGADO');
    expect(estadosDeOrigen('ANULADO', false)).not.toContain('REEMBOLSADO');
  });

  it('ENTREGADO y REEMBOLSADO no se pueden pedir: los pone el registro de la entrega', () => {
    expect(estadosDeOrigen('ENTREGADO', false)).toEqual([]);
    expect(estadosDeOrigen('REEMBOLSADO', false)).toEqual([]);
  });

  it('repetir el estado actual es válido: así un reintento no falla', () => {
    expect(estadosDeOrigen('RECIBIDO', false)).toContain('RECIBIDO');
    expect(estadosDeOrigen('ANULADO', false)).toContain('ANULADO');
  });

  it('una orden cerrada no se edita, ni aunque el cambio traiga también el estado', () => {
    // Anular de nuevo una anulada (el reintento) pasa; cambiarle además el
    // precio, no.
    expect(estadosDeOrigen('ANULADO', true)).not.toContain('ANULADO');
    expect(estadosDeOrigen(undefined, true)).toEqual(['RECIBIDO']);
  });

  it('sin estado ni otros campos, cualquier estado vale (el PATCH vacío)', () => {
    expect(estadosDeOrigen(undefined, false)).toEqual([...ESTADOS_ORDEN]);
  });
});

describe('Dominio: los renglones de la boleta — SPEC-KRILINXI-068', () => {
  it('la migración 007 crea momento_item con INGRESO y ENTREGA, y el código dice lo mismo', () => {
    expect(enumsDelSchema().get('momento_item')).toEqual(['INGRESO', 'ENTREGA']);
  });

  it('una orden abierta es la que no está cerrada: hoy, solo RECIBIDO', () => {
    expect([...ESTADOS_ABIERTOS]).toEqual(['RECIBIDO']);
  });
});
