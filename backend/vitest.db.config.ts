// Configuración de la suite de integración: tests contra Postgres real — SPEC-ALE186-007.
//
// Se corre con `npm run test:db` y necesita Docker levantado. La suite normal
// (`npm test`, en `vitest.config.ts`) no incluye estos tests y sigue corriendo
// sin base.
//
// Cuándo va un test acá y cuándo con dobles: ver CLAUDE.md, sección 4.
import { defineConfig } from 'vitest/config';
import { entornoDePrueba } from './tests/db/entorno.js';

const { urlPrueba } = entornoDePrueba();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.db.test.ts'],

    // Una vez antes de todo: borra y recrea la base de pruebas desde el schema.
    globalSetup: ['tests/db/preparar.ts'],
    // En cada archivo: cierra el pool al terminar.
    setupFiles: ['tests/db/alCerrar.ts'],

    env: {
      // El pool de `src/db/pool.ts` se conecta a DATABASE_URL. Acá apunta a la
      // base de pruebas, así que el código de la aplicación corre sin saber que
      // está en un test. La base de desarrollo nunca recibe una conexión.
      DATABASE_URL: urlPrueba,
      NODE_ENV: 'test',
    },

    // Las pruebas de concurrencia esperan a propósito a que otra conexión
    // confirme; el límite por defecto (5 s) queda justo con Docker en Windows.
    testTimeout: 15_000,
  },
});
