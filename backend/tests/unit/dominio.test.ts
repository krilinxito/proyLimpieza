import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCIONES_AUDITORIA,
  ESTADOS_ORDEN,
  METODOS_PAGO,
  TIPOS_PAGO,
  TIPOS_RETIRO,
  esEstadoOrden,
  estadosDeOrigen,
} from '../../src/utils/dominio.js';

/**
 * Los ENUM leídos del schema, que es la fuente de verdad. Es la misma técnica
 * que `frontend/src/lib/dominio.test.ts`: el test no compara el código consigo
 * mismo, compara el código con la base.
 */
function enumsDelSchema(): Map<string, string[]> {
  const ruta = resolve(import.meta.dirname, '../../../context/lavanderia_schema.sql');
  const sql = readFileSync(ruta, 'utf8');
  const enums = new Map<string, string[]>();
  for (const [, nombre = '', valores = ''] of sql.matchAll(/CREATE TYPE (\w+)\s+AS ENUM \(([^)]*)\)/g)) {
    enums.set(nombre, [...valores.matchAll(/'([^']+)'/g)].map(([, v = '']) => v));
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
  ])('%s tiene exactamente los mismos valores que el código', (nombre, lista) => {
    expect(enums.get(nombre)).toEqual([...lista]);
  });

  it('reconoce un estado válido y rechaza uno mal escrito', () => {
    expect(esEstadoOrden('EN_PROCESO')).toBe(true);
    expect(esEstadoOrden('EN PROCESO')).toBe(false);
    expect(esEstadoOrden(undefined)).toBe(false);
  });
});

describe('Dominio: las acciones de auditoría — SPEC-ALE186-010', () => {
  it('accion_auditoria tiene exactamente los mismos valores que el código', () => {
    expect(enumsDelSchema().get('accion_auditoria')).toEqual([...ACCIONES_AUDITORIA]);
  });
});

describe('Dominio: cómo avanza una orden — SPEC-ALE186-004', () => {
  it('se avanza hacia adelante, saltando pasos si hace falta', () => {
    expect(estadosDeOrigen('LISTO', false)).toEqual(['RECIBIDO', 'EN_PROCESO', 'LISTO']);
  });

  it('no se vuelve hacia atrás', () => {
    expect(estadosDeOrigen('EN_PROCESO', false)).not.toContain('LISTO');
    expect(estadosDeOrigen('RECIBIDO', false)).toEqual(['RECIBIDO']);
  });

  it('se anula desde cualquier estado menos ENTREGADO', () => {
    expect(estadosDeOrigen('ANULADO', false)).not.toContain('ENTREGADO');
  });

  it('ENTREGADO no se puede pedir: lo pone el registro de la entrega', () => {
    expect(estadosDeOrigen('ENTREGADO', false)).toEqual([]);
  });

  it('repetir el estado actual es válido: así un reintento no falla', () => {
    expect(estadosDeOrigen('LISTO', false)).toContain('LISTO');
    expect(estadosDeOrigen('ANULADO', false)).toContain('ANULADO');
  });

  it('una orden cerrada no se edita, ni aunque el cambio traiga también el estado', () => {
    // Anular de nuevo una anulada (el reintento) pasa; cambiarle además el
    // precio, no.
    expect(estadosDeOrigen('ANULADO', true)).not.toContain('ANULADO');
    expect(estadosDeOrigen(undefined, true)).toEqual(['RECIBIDO', 'EN_PROCESO', 'LISTO']);
  });

  it('sin estado ni otros campos, cualquier estado vale (el PATCH vacío)', () => {
    expect(estadosDeOrigen(undefined, false)).toEqual([...ESTADOS_ORDEN]);
  });
});
