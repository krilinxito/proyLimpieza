import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Las carpetas de CLAUDE.md §5 tienen que existir en el repo, no solo en la cabeza de quien
 * lo montó. Git no versiona carpetas vacías, así que cada una lleva un README que explica
 * qué va dentro: sirve de ancla para git y de guía para quien llega nuevo.
 */
describe('Estructura de carpetas — SPEC-001', () => {
  it.each(['components', 'features', 'hooks', 'lib', 'pages'])(
    'existe src/%s/ y sobrevive a un clone',
    (carpeta) => {
      expect(existsSync(fileURLToPath(new URL(carpeta, import.meta.url)))).toBe(true);
    },
  );
});
