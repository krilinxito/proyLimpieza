import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ESTADOS_ORDEN,
  METODOS_PAGO,
  ROLES,
  TEXTO_ESTADO_ORDEN,
  TEXTO_METODO_PAGO,
  TEXTO_ROL,
  TEXTO_TIPO_PAGO,
  TEXTO_TIPO_RETIRO,
  TIPOS_PAGO,
  TIPOS_RETIRO,
  esEstadoOrden,
  esMetodoPago,
  esRol,
  esTipoPago,
  esTipoRetiro,
} from './dominio';

/**
 * Lee los ENUM directamente del schema, que es la fuente de verdad. Así el test no compara
 * el código consigo mismo: compara el código con la base.
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

// Qué ENUM del schema corresponde a qué lista del código.
const EN_EL_CODIGO: Record<string, readonly string[]> = {
  estado_orden: ESTADOS_ORDEN,
  tipo_retiro: TIPOS_RETIRO,
  tipo_pago: TIPOS_PAGO,
  metodo_pago: METODOS_PAGO,
  rol_usuario: ROLES,
};

// La auditoría no llega nunca al dispositivo (CLAUDE.md §7), así que su ENUM no hace falta
// aquí. Está en la lista a propósito: un ENUM nuevo en el schema que no esté ni mapeado ni
// excluido hace fallar el test, y obliga a decidir.
const NO_SE_USAN_EN_EL_DISPOSITIVO = ['accion_auditoria'];

describe('dominio: valores iguales a los del schema — SPEC-KRILINXI-002', () => {
  const schema = enumsDelSchema();

  it('encuentra los ENUM en el schema (si esto falla, cambió el formato del SQL)', () => {
    expect(schema.size).toBeGreaterThan(0);
  });

  it.each(Object.entries(EN_EL_CODIGO))('%s tiene los mismos valores y en el mismo orden', (nombre, valores) => {
    expect(valores).toEqual(schema.get(nombre));
  });

  it('todo ENUM del schema está en el código o excluido a propósito', () => {
    const conocidos = [...Object.keys(EN_EL_CODIGO), ...NO_SE_USAN_EN_EL_DISPOSITIVO];
    expect([...schema.keys()].filter((nombre) => !conocidos.includes(nombre))).toEqual([]);
  });
});

describe('dominio: validar lo que llega de SQLite — SPEC-KRILINXI-002', () => {
  it.each([
    ['estado de orden', esEstadoOrden, 'EN_PROCESO'],
    ['tipo de retiro', esTipoRetiro, 'SIN_BOLETA'],
    ['tipo de pago', esTipoPago, 'ADELANTO'],
    ['método de pago', esMetodoPago, 'QR'],
    ['rol', esRol, 'EMPLEADO'],
  ])('acepta un %s válido', (_tipo, esValido, valor) => {
    expect(esValido(valor)).toBe(true);
  });

  it.each([
    ['con espacio en vez de guion bajo', 'EN PROCESO'],
    ['en minúsculas', 'recibido'],
    ['vacío', ''],
    ['null', null],
    ['un número', 3],
  ])('rechaza un estado %s', (_caso, valor) => {
    expect(esEstadoOrden(valor)).toBe(false);
  });

  it('estrecha el tipo: después del if, TypeScript sabe que es un EstadoOrden', () => {
    const deSqlite: unknown = 'LISTO';
    if (esEstadoOrden(deSqlite)) {
      // Sin el type guard, esta indexación no compilaría: `unknown` no sirve de clave.
      expect(TEXTO_ESTADO_ORDEN[deSqlite]).toBe('Listo para retirar');
    } else {
      expect.unreachable('LISTO es un estado válido');
    }
  });
});

describe('dominio: textos del mostrador — SPEC-KRILINXI-002', () => {
  it('EN_PROCESO se muestra "En proceso", no el código', () => {
    expect(TEXTO_ESTADO_ORDEN.EN_PROCESO).toBe('En proceso');
  });

  it.each([
    ['estado de orden', ESTADOS_ORDEN, TEXTO_ESTADO_ORDEN],
    ['tipo de retiro', TIPOS_RETIRO, TEXTO_TIPO_RETIRO],
    ['tipo de pago', TIPOS_PAGO, TEXTO_TIPO_PAGO],
    ['método de pago', METODOS_PAGO, TEXTO_METODO_PAGO],
    ['rol', ROLES, TEXTO_ROL],
  ])('ningún %s muestra su código en pantalla', (_tipo, valores, textos: Record<string, string>) => {
    for (const valor of valores) {
      expect(textos[valor]).toBeTruthy();
      // Ni el código tal cual, ni nada con guion bajo: eso es idioma del sistema.
      expect(textos[valor]).not.toMatch(/_|^[A-Z]{2,}$/);
    }
  });
});
