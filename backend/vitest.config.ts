import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Los tests contra Postgres real tienen su propia suite (`npm run test:db`,
    // en `vitest.db.config.ts`) y necesitan Docker: acá no entran — SPEC-ALE186-007.
    exclude: ['tests/db/**', 'node_modules/**'],

    // La suite no necesita Postgres levantado: los tests que tocan la base
    // reemplazan el model por un doble. Pero `src/config.ts` valida DATABASE_URL
    // al importarse, así que le damos una de mentira para que el arranque no
    // falle por una variable que en los tests no se llega a usar.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      NODE_ENV: 'test',

      // Mismo motivo, para la config de autenticación (SPEC-ALE186-002).
      // Este secreto es de mentira y es público: son 32 bytes de texto legible
      // en base64url, lo justo para que la validación lo acepte. El de verdad
      // vive en el .env de cada máquina y no está en el repositorio.
      PS_JWT_SECRET_B64: 'c2VjcmV0by1kZS1wcnVlYmEtZGUtbGEtc3VpdGUtMzI',
      PS_JWT_AUDIENCE: 'lavanderia-test',
    },
  },
});
