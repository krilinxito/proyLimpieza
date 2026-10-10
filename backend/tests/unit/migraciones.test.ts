import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CarpetaInvalidaError, chequeoDeArranque, leerMigraciones, type Consultable } from '../../src/db/migraciones.js';

// Lo que se decide en TypeScript, sin base: cómo se lee la carpeta y qué dice el
// chequeo del arranque. Que se apliquen bien está en tests/db/migraciones.db.test.ts.

const carpetas: string[] = [];

afterEach(async () => {
  while (carpetas.length > 0) await rm(carpetas.pop() ?? '', { recursive: true, force: true });
});

async function carpeta(nombres: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'migraciones-'));
  carpetas.push(dir);
  for (const nombre of nombres) await writeFile(path.join(dir, nombre), 'SELECT 1;');
  return dir;
}

/** Una base de mentira que dice tener aplicadas estas migraciones. */
function baseCon(aplicadas: string[]): Consultable {
  return {
    query: async () => ({ rows: aplicadas.map((nombre) => ({ nombre })) }) as never,
  };
}

describe('Migraciones: la carpeta — SPEC-ALE186-019', () => {
  it('ordena por número e ignora lo que no es .sql', async () => {
    const dir = await carpeta(['010_ultima.sql', '002_segunda.sql', 'README.md', '001_primera.sql']);

    expect((await leerMigraciones(dir)).map((m) => [m.numero, m.nombre])).toEqual([
      [1, '001_primera.sql'],
      [2, '002_segunda.sql'],
      [10, '010_ultima.sql'],
    ]);
  });

  it.each([
    ['sin tres dígitos', ['1_primera.sql']],
    ['con mayúsculas', ['001_Primera.sql']],
    ['con espacios', ['001_la primera.sql']],
    ['sin nombre', ['001.sql']],
  ])('rechaza un archivo %s', async (_caso, nombres) => {
    await expect(leerMigraciones(await carpeta(nombres))).rejects.toBeInstanceOf(CarpetaInvalidaError);
  });

  it('rechaza dos archivos con el mismo número, nombrando a los dos', async () => {
    const error = await leerMigraciones(await carpeta(['001_una.sql', '001_otra.sql'])).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CarpetaInvalidaError);
    expect(String(error)).toMatch(/001_otra\.sql.*001_una\.sql|001_una\.sql.*001_otra\.sql/);
  });
});

describe('Migraciones: el chequeo del arranque — SPEC-ALE186-019', () => {
  it('con una pendiente, lo dice en singular, con su nombre y el comando', async () => {
    const dir = await carpeta(['001_ya.sql', '002_falta.sql']);

    expect(await chequeoDeArranque(baseCon(['001_ya.sql']), dir)).toBe(
      'Falta 1 migración en la base (002_falta.sql). Aplicalas con `npm run migrar --workspace backend` y volvé a arrancar.',
    );
  });

  it('con todas aplicadas, nada: el servidor arranca como siempre', async () => {
    const dir = await carpeta(['001_ya.sql']);

    expect(await chequeoDeArranque(baseCon(['001_ya.sql']), dir)).toBeNull();
  });
});
