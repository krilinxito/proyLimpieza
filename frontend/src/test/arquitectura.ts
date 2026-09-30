/**
 * Helper para tests de arquitectura — SPEC-KRILINXI-003
 *
 * Un test de arquitectura lee el código fuente y falla si se rompe una regla de
 * organización ("ningún componente llama a axios"). Ver la bitácora de SPEC-KRILINXI-002.
 *
 * Uso:
 *
 *     const archivos = archivosFuente('pages', 'features');
 *     const culpables = archivos.filter((a) => /localStorage/.test(a.fuente));
 *     expect(culpables.map((a) => a.ruta)).toEqual([]);
 *
 * Las rutas son relativas a `src/` y siempre con `/`, también en Windows: así un fallo
 * se lee igual en todas las máquinas.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(import.meta.dirname, '..');

export type ArchivoFuente = { ruta: string; fuente: string };

function recorrer(carpeta: string): string[] {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    return statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta];
  });
}

/** Los .ts/.tsx bajo esas carpetas de `src/` (sin argumentos, todo `src/`). Excluye los tests. */
export function archivosFuente(...carpetas: string[]): ArchivoFuente[] {
  const raices = carpetas.length ? carpetas.map((c) => join(SRC, c)) : [SRC];
  return raices
    .flatMap(recorrer)
    .filter((ruta) => /\.tsx?$/.test(ruta) && !/\.test\.tsx?$/.test(ruta))
    .map((ruta) => ({
      ruta: relative(SRC, ruta).replaceAll('\\', '/'),
      fuente: readFileSync(ruta, 'utf8'),
    }));
}
