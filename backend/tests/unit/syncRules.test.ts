import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Las reglas de PowerSync son control de acceso (CLAUDE.md §7): lo que no está ahí no
// llega a ninguna tablet. Este test lee el archivo de verdad y vigila dos cosas del bucket
// `global`: a quién se entrega y qué entrega.
//
// Se lee como texto, igual que `frontend/src/lib/powersync/schema.test.ts`, en vez de
// sumar una librería de YAML solo para esto. Que PowerSync ACEPTE el archivo no se puede
// probar acá: se comprobó con su propio validador y con el servicio corriendo (bitácora
// de SPEC-ALE186-024).
const SYNC_RULES = readFileSync(resolve(import.meta.dirname, '../../../docker/powersync/sync-rules.yaml'), 'utf8');

/** Las líneas de un bucket, desde su nombre hasta el siguiente bucket o el final. */
function bucket(nombre: string): string {
  const [, cuerpo = ''] = new RegExp(`^ {2}${nombre}:\\n([\\s\\S]*?)(?=^ {2}\\w+:\\n|(?![\\s\\S]))`, 'm').exec(SYNC_RULES) ?? [];
  return cuerpo;
}

/** El texto de `parameters: |` hasta `data:`, sin comentarios. */
function parametros(cuerpo: string): string {
  const [, consulta = ''] = /parameters: \|\n([\s\S]*?)\n\s*data:/.exec(cuerpo) ?? [];
  return consulta.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
}

/** Las consultas `- SELECT …` de `data`. */
function consultasData(cuerpo: string): string[] {
  return [...cuerpo.matchAll(/^\s*- (SELECT .+)$/gm)].map(([, consulta = '']) => consulta.trim());
}

describe('Sync rules: el bucket global solo baja a cuentas activas — SPEC-ALE186-024', () => {
  it('tiene una consulta parameters sobre la fila del usuario del token, exigiendo activo = true', () => {
    const consulta = parametros(bucket('global'));

    expect(consulta).toMatch(/\bFROM usuarios\b/);
    expect(consulta).toMatch(/\bid = request\.user_id\(\)/);
    expect(consulta).toMatch(/\bactivo = true\b/);
  });

  it('la consulta parameters no devuelve columnas: si devolviera, PowerSync exigiría usarlas en cada data', () => {
    // "Query must cover all bucket parameters": comprobado con el validador de PowerSync 1.25.
    expect(parametros(bucket('global'))).toMatch(/^SELECT FROM usuarios\b/);
  });

  it('las consultas data son las de siempre: todos los clientes, y sucursales y usuarios con columnas explícitas', () => {
    expect(consultasData(bucket('global'))).toEqual([
      'SELECT * FROM clientes',
      'SELECT id, nombre, direccion, telefono, activa FROM sucursales',
      'SELECT id, nombre_completo, username, rol, sucursal_id, activo FROM usuarios',
    ]);
  });

  it('password_hash no baja a ningún dispositivo, desde ningún bucket', () => {
    expect(SYNC_RULES.replace(/#.*$/gm, '')).not.toMatch(/password_hash/);
    // Y usuarios nunca con SELECT *, que se lo llevaría.
    expect(SYNC_RULES).not.toMatch(/SELECT \* FROM usuarios/);
  });

  it('el bucket sucursal sigue igual: también filtra por cuenta activa', () => {
    expect(parametros(bucket('sucursal'))).toMatch(/\bactivo = true\b/);
  });
});
