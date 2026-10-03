/**
 * Base local falsa para los tests de pantalla — SPEC-KRILINXI-004
 *
 * No guarda nada: cada método es un `vi.fn()` que anota qué le pidieron. Es el que usa
 * `renderEnRuta` por defecto, porque las pantallas que no leen datos no necesitan una base
 * de verdad y así no pagan el costo de abrir SQLite. Está aparte de `baseLocalDePrueba.ts`
 * para que los tests de pantalla no carguen el SDK de Node.
 *
 *     const baseLocal = controlFalso();
 *     renderEnRuta(<App />, '/', { baseLocal });
 *     await waitFor(() => expect(baseLocal.conectar).toHaveBeenCalled());
 */
import { vi } from 'vitest';
import type { ControlBaseLocal } from '../lib/powersync';

export function controlFalso() {
  return {
    base: {
      consultar: vi.fn(async () => []),
      ejecutar: vi.fn(async () => {}),
    },
    conectar: vi.fn(async (_obtenerToken: () => string | null) => {}),
    desconectarYBorrar: vi.fn(async () => {}),
  } satisfies ControlBaseLocal;
}
