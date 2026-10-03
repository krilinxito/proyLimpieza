import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TABLAS, TABLAS_SOLO_LOCALES } from './schema';

/**
 * El schema local tiene que coincidir con dos archivos que mandan sobre él:
 *
 *  - `docker/powersync/sync-rules.yaml`: qué tablas y columnas BAJAN al dispositivo.
 *  - `context/lavanderia_schema.sql`: qué columnas existen, para las reglas con `SELECT *`.
 *
 * Se leen de verdad en vez de copiar las columnas aquí: una copia no se entera cuando
 * alguien cambia la sync rule.
 */
const RAIZ = resolve(import.meta.dirname, '../../../..');
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), 'utf8');

const SYNC_RULES = leer('docker/powersync/sync-rules.yaml');
const SCHEMA_SQL = leer('context/lavanderia_schema.sql');

/** Columnas de cada CREATE TABLE del SQL, sin las líneas de CONSTRAINT. */
function columnasDelSql(): Map<string, string[]> {
  const tablas = new Map<string, string[]>();
  for (const [, nombre = '', cuerpo = ''] of SCHEMA_SQL.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)) {
    const columnas = cuerpo
      .split('\n')
      .map((linea) => linea.replace(/--.*$/, '').trim())
      // `nombre tipo`: el tipo puede ser de Postgres (VARCHAR) o un ENUM propio (estado_orden).
      // Deja afuera las líneas de un CHECK, como `tipo_retiro = 'CON_BOLETA'`.
      .filter((linea) => /^[a-z_]+\s+[A-Za-z_]/.test(linea))
      .map((linea) => linea.split(/\s+/)[0] ?? '');
    tablas.set(nombre, columnas);
  }
  return tablas;
}

/** Tabla → columnas que baja, a partir de cada `- SELECT ... FROM tabla` de las sync rules. */
function columnasQueBajan(): Map<string, string[]> {
  const sql = columnasDelSql();
  const bajan = new Map<string, string[]>();
  for (const [, lista = '', tabla = ''] of SYNC_RULES.matchAll(/^\s*- SELECT (.+?) FROM (\w+)/gm)) {
    const columnas = lista.trim() === '*' ? (sql.get(tabla) ?? []) : lista.split(',').map((c) => c.trim());
    // `id` no se declara en el schema local: PowerSync lo agrega solo.
    bajan.set(tabla, columnas.filter((c) => c !== 'id'));
  }
  return bajan;
}

function columnasLocales(): Map<string, string[]> {
  return new Map(Object.entries(TABLAS).map(([nombre, tabla]) => [nombre, tabla.columns.map((c) => c.name)]));
}

describe('Schema local igual a lo que bajan las sync rules — SPEC-KRILINXI-004', () => {
  const bajan = columnasQueBajan();
  const locales = columnasLocales();

  it('lee las sync rules y el schema SQL (si falla, cambió el formato de alguno)', () => {
    expect([...bajan.keys()].sort()).toEqual(['clientes', 'entregas', 'ordenes', 'pagos', 'sucursales', 'usuarios']);
    expect(columnasDelSql().get('ordenes')).toContain('precio_total');
  });

  it('declara exactamente las tablas que bajan, ni una más ni una menos', () => {
    expect([...locales.keys()].sort()).toEqual([...bajan.keys()].sort());
  });

  it.each(['clientes', 'sucursales', 'usuarios', 'ordenes', 'entregas', 'pagos'])(
    '%s tiene las mismas columnas que baja su sync rule',
    (tabla) => {
      expect([...(locales.get(tabla) ?? [])].sort()).toEqual([...(bajan.get(tabla) ?? [])].sort());
    },
  );

  it('usuarios no tiene password_hash en el dispositivo', () => {
    expect(locales.get('usuarios')).not.toContain('password_hash');
    // Y no es casualidad del test: la columna existe en Postgres.
    expect(columnasDelSql().get('usuarios')).toContain('password_hash');
  });

  it('auditoría no baja a ningún dispositivo (CLAUDE.md §7)', () => {
    expect(locales.has('auditoria')).toBe(false);
  });

  it('los montos se guardan como texto, nunca como número de punto flotante', () => {
    const tipoDe = (tabla: keyof typeof TABLAS, columna: string) =>
      TABLAS[tabla].columns.find((c) => c.name === columna)?.type;
    expect(tipoDe('ordenes', 'precio_total')).toBe('TEXT');
    expect(tipoDe('entregas', 'precio_final')).toBe('TEXT');
    expect(tipoDe('pagos', 'monto')).toBe('TEXT');
  });
});

describe('Sync rules: la baja de un empleado corta su sincronización — SPEC-KRILINXI-004', () => {
  it('el bucket sucursal solo entrega datos a usuarios activos', () => {
    const [, parametros = ''] = /^\s{2}sucursal:[\s\S]*?parameters: \|([\s\S]*?)\n\s*data:/m.exec(SYNC_RULES) ?? [];
    expect(parametros).toMatch(/FROM usuarios/);
    expect(parametros).toMatch(/\bactivo = true\b/);
  });
});

describe('Tablas solo del dispositivo — SPEC-KRILINXI-007', () => {
  // Quedan fuera de la comparación con las sync rules A PROPÓSITO: no vienen de ahí.
  it.each(Object.entries(TABLAS_SOLO_LOCALES))('%s es solo local: ni baja ni sube', (_nombre, tabla) => {
    expect(tabla.localOnly).toBe(true);
  });

  it.each(Object.keys(TABLAS_SOLO_LOCALES))('%s no aparece en las sync rules ni en Postgres', (nombre) => {
    expect(SYNC_RULES).not.toMatch(new RegExp(`\\b${nombre}\\b`));
    expect(SCHEMA_SQL).not.toMatch(new RegExp(`\\b${nombre}\\b`));
  });
});
