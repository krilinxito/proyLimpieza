// Cierra el pool al terminar cada archivo de la suite de integración — SPEC-ALE186-007.
//
// Cada archivo de test corre con sus propios módulos, y por lo tanto con su
// propio pool. Si nadie lo cierra, las conexiones quedan abiertas hasta que
// Vitest mata el worker, y Postgres las ve como clientes colgados.
import { afterAll } from 'vitest';
import { pool } from '../../src/db/pool.js';

afterAll(async () => {
  await pool.end();
});
