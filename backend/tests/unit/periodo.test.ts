import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hoyEnElNegocio, leerPeriodo } from '../../src/utils/periodo.js';

/** Todos los .ts de `src`, para buscar dónde se define algo. */
function archivosDeSrc(dir = resolve(import.meta.dirname, '../../src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) return archivosDeSrc(ruta);
    return ruta.endsWith('.ts') ? [ruta] : [];
  });
}

describe('El período compartido de las consultas del admin — SPEC-ALE186-012', () => {
  it('sin fechas, son los 30 días que terminan hoy en Bolivia', () => {
    const { desde, hasta, sucursalId } = leerPeriodo({});

    expect(hasta).toBe(hoyEnElNegocio());
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
    expect(dias).toBe(29);
    expect(sucursalId).toBeNull();
  });

  it('con solo hasta, los 30 días que terminan ese día', () => {
    expect(leerPeriodo({ hasta: '2026-03-31' })).toEqual({ desde: '2026-03-02', hasta: '2026-03-31', sucursalId: null });
  });

  it('se define una sola vez: estadísticas y auditoría la importan, no la copian', () => {
    // Si alguien vuelve a escribir su propio `leerPeriodo` en un controller, las
    // dos pantallas del admin podrían entender distinto el mismo `?desde=`.
    const definiciones = archivosDeSrc().filter((archivo) =>
      /function leerPeriodo\b/.test(readFileSync(archivo, 'utf8')),
    );

    expect(definiciones.map((archivo) => archivo.replaceAll('\\', '/'))).toEqual([
      expect.stringMatching(/src\/utils\/periodo\.ts$/),
    ]);
  });
});
