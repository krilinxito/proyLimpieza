import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Las reglas de PowerSync son control de acceso (CLAUDE.md §7): lo que no está ahí no
// llega a ninguna tablet. Este test lee el archivo de verdad y vigila, de cada bucket, a
// quién se entrega y qué entrega: `global` (SPEC-ALE186-024) y `atencion_admin`
// (SPEC-KRILINXI-028).
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

describe('Sync rules: el ADMIN baja la ropa de la sucursal donde atiende — SPEC-KRILINXI-028', () => {
  it('la sucursal sale del parámetro que manda la tablet, y solo para la fila del ADMIN activo que pide', () => {
    const consulta = parametros(bucket('atencion_admin'));

    expect(consulta).toMatch(/^SELECT request\.parameters\(\) ->> 'sucursal_id' AS sucursal_id FROM usuarios\b/);
    // Estas tres condiciones SON la autorización: el parámetro lo controla la tablet.
    expect(consulta).toMatch(/\bid = request\.user_id\(\)/);
    expect(consulta).toMatch(/\brol = 'ADMIN'/);
    expect(consulta).toMatch(/\bactivo = true\b/);
  });

  it('un ADMIN que no está atendiendo no recibe el bucket: sin parámetro, la consulta no devuelve fila', () => {
    // Sin esta condición, PowerSync le armaba un bucket `atencion_admin[null]` vacío en cada
    // conexión (comprobado evaluando las reglas con su motor, ver la bitácora).
    expect(parametros(bucket('atencion_admin'))).toMatch(/AND request\.parameters\(\) ->> 'sucursal_id' IS NOT NULL\b/);
  });

  it('baja lo mismo que el bucket de la sucursal de un empleado: la ropa, las entregas, los pagos y los renglones', () => {
    const datos = consultasData(bucket('atencion_admin'));
    expect(datos).toEqual(consultasData(bucket('sucursal')));
    // Cuatro desde SPEC-KRILINXI-068: los renglones de la boleta.
    expect(datos).toHaveLength(4);
  });

  it('no apaga las advertencias de PowerSync: sin accept_potentially_dangerous_queries en ningún bucket', () => {
    // PowerSync no marca esta consulta porque está atada a request.user_id() (comprobado con su
    // validador: sin esa condición, avisa "Potentially dangerous query"). El flag no autoriza
    // nada; solo callaría ese aviso si alguien borrara la condición.
    expect(SYNC_RULES.replace(/#.*$/gm, '')).not.toMatch(/accept_potentially_dangerous_queries/);
  });

  it('el bucket del empleado no escucha a la tablet: su sucursal sale de su fila en la base', () => {
    const consulta = parametros(bucket('sucursal'));
    expect(consulta).toMatch(/^SELECT sucursal_id FROM usuarios\b/);
    expect(consulta).not.toMatch(/request\.parameters/);
  });
});

describe('Sync rules: los renglones de la boleta — SPEC-KRILINXI-068', () => {
  const RENGLONES =
    'SELECT id, orden_id, sucursal_id, momento, posicion, descripcion, cantidad, precio_unitario FROM orden_items ' +
    'WHERE sucursal_id = bucket.sucursal_id';

  it('un EMPLEADO baja los renglones solo de su sucursal, con lista explícita de columnas', () => {
    // El bucket `sucursal` se arma con la sucursal de la fila del empleado en la base, nunca con la que diga la tablet.
    expect(consultasData(bucket('sucursal'))).toContain(RENGLONES);
  });

  it('el ADMIN que atiende los baja de la sucursal donde atiende; sin el parámetro, el bucket no existe', () => {
    expect(consultasData(bucket('atencion_admin'))).toContain(RENGLONES);
    expect(parametros(bucket('atencion_admin'))).toMatch(/AND request\.parameters\(\) ->> 'sucursal_id' IS NOT NULL/);
  });

  it('los renglones no bajan en el bucket global: no son un catálogo', () => {
    expect(consultasData(bucket('global')).join(' ')).not.toMatch(/orden_items/);
  });

  it('ninguna consulta de renglones usa SELECT * ni JOIN', () => {
    const deRenglones = consultasData(SYNC_RULES).filter((consulta) => /FROM orden_items/.test(consulta));
    expect(deRenglones).toHaveLength(2);
    for (const consulta of deRenglones) {
      expect(consulta).not.toMatch(/SELECT \*/);
      expect(consulta).not.toMatch(/\bJOIN\b/);
    }
  });
});
