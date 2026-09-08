import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';

// Reemplazamos el model por un doble. El test no necesita Postgres levantado:
// lo que se está probando es el controller —qué responde según lo que le diga
// el model—, no la base. Así la suite corre en cualquier máquina y en CI.
vi.mock('../../src/models/health.model.js', () => ({
  estaDisponible: vi.fn(),
}));

const { estaDisponible } = await import('../../src/models/health.model.js');
const estaDisponibleMock = vi.mocked(estaDisponible);

describe('GET /api/health — SPEC-ALE186-001', () => {
  beforeEach(() => {
    estaDisponibleMock.mockReset();
  });

  it('responde 200 y el estado de la conexión cuando Postgres contesta', async () => {
    estaDisponibleMock.mockResolvedValue(true);

    const res = await testApi().get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok', baseDeDatos: 'conectada' });
  });

  it('responde 503 con el formato de error uniforme cuando la base no responde', async () => {
    estaDisponibleMock.mockResolvedValue(false);

    const res = await testApi().get('/api/health');

    expectApiError(res, { status: 503, codigo: 'SERVICIO_NO_DISPONIBLE' });
  });
});
