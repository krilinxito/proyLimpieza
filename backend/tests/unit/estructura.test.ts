import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// La estructura MVC de la sección 5 del CLAUDE.md, escrita como test.
// Puede parecer raro testear carpetas, pero la separación por capas es una
// decisión de arquitectura, no una preferencia: si alguien borra `services/`
// o mueve las rutas de sitio, conviene que salte acá y no en una revisión.
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

describe('Estructura del backend — SPEC-001', () => {
  it.each(['models', 'controllers', 'routes', 'middleware', 'services', 'db', 'utils'])(
    'existe la carpeta %s/',
    (carpeta) => {
      expect(existsSync(path.join(src, carpeta))).toBe(true);
    },
  );

  it('el registro central de rutas monta health y deja previstos los recursos siguientes', () => {
    const indice = readFileSync(path.join(src, 'routes/index.ts'), 'utf8');

    expect(indice).toContain("apiRouter.use('/health'");

    for (const recurso of ['auth', 'clientes', 'ordenes', 'entregas', 'pagos', 'estadisticas']) {
      expect(indice).toContain(`/${recurso}`);
    }
  });
});
