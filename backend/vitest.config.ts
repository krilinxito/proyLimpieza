import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    // La suite no necesita Postgres levantado: los tests que tocan la base
    // reemplazan el model por un doble. Pero `src/config.ts` valida DATABASE_URL
    // al importarse, así que le damos una de mentira para que el arranque no
    // falle por una variable que en los tests no se llega a usar.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      NODE_ENV: 'test',
    },
  },
});
