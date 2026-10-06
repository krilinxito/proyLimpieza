import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';
import { comoAdmin, conSesion } from '../helpers/usuarios.js';
import { hoyEnElNegocio } from '../../src/utils/periodo.js';

// El model es un doble: lo que se prueba acá es el controller —qué filtros le
// pasa y qué responde a cada entrada—. Que la consulta filtre bien de verdad
// está en tests/db/auditoriaConsulta.db.test.ts.
vi.mock('../../src/models/auditoria.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/auditoria.model.js')>()),
  consultar: vi.fn(),
}));

const consultar = vi.mocked((await import('../../src/models/auditoria.model.js')).consultar);

const USUARIO = '55555555-5555-5555-5555-555555555555';
const SUCURSAL = '22222222-2222-2222-2222-222222222222';

const REGISTRO = {
  id: '77777777-7777-7777-7777-777777777777',
  fecha: '2026-03-10 21:00:00',
  accion: 'EDITAR' as const,
  tablaAfectada: 'usuarios' as const,
  registroId: USUARIO,
  sucursalId: null,
  valoresAnteriores: { contrasena_cambiada: true },
  usuario: { id: '33333333-3333-3333-3333-333333333333', nombreCompleto: 'Admin', username: 'admin' },
};

function pedir(query: Record<string, string> = {}, sesion: Record<string, string> = comoAdmin()) {
  return testApi().get('/api/auditoria').query(query).set(sesion);
}

beforeEach(() => {
  vi.clearAllMocks();
  consultar.mockResolvedValue({ total: 1, registros: [REGISTRO] });
});

describe('GET /api/auditoria — SPEC-ALE186-012', () => {
  it('responde la página con el período, la paginación, el total y los registros', async () => {
    const res = await pedir({ desde: '2026-03-01', hasta: '2026-03-31' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      desde: '2026-03-01',
      hasta: '2026-03-31',
      pagina: 1,
      porPagina: 50,
      total: 1,
      registros: [REGISTRO],
    });
  });

  it('sin filtros: los últimos 30 días contando hoy en Bolivia, página 1 de 50, sin filtrar nada más', async () => {
    const res = await pedir();

    expect(res.body.hasta).toBe(hoyEnElNegocio());
    expect(consultar).toHaveBeenCalledWith(
      {
        desde: res.body.desde,
        hasta: res.body.hasta,
        sucursalId: null,
        usuarioId: null,
        accion: null,
        tabla: null,
        registroId: null,
      },
      { pagina: 1, porPagina: 50 },
    );
  });

  it('pasa al model todos los filtros que vinieron', async () => {
    await pedir({
      usuario_id: USUARIO,
      sucursal_id: SUCURSAL,
      accion: 'COBRAR',
      tabla: 'pagos',
      registro_id: USUARIO,
      pagina: '3',
      por_pagina: '200',
    });

    expect(consultar).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: USUARIO, sucursalId: SUCURSAL, accion: 'COBRAR', tabla: 'pagos', registroId: USUARIO }),
      { pagina: 3, porPagina: 200 },
    );
  });

  it.each([
    ['una acción que no existe', { accion: 'BORRAR' }],
    ['una tabla que no se audita', { tabla: 'auditoria' }],
    ['un usuario que no es UUID', { usuario_id: '42' }],
    ['una sucursal que no es UUID', { sucursal_id: '42' }],
    ['un registro que no es UUID', { registro_id: '42' }],
    ['una fecha mal escrita', { desde: '10/03/2026' }],
    ['desde después de hasta', { desde: '2026-03-31', hasta: '2026-03-01' }],
    ['la página 0', { pagina: '0' }],
    ['una página que no es entera', { pagina: '1.5' }],
    ['una página escrita en notación científica', { pagina: '1e2' }],
    ['más de 200 por página', { por_pagina: '201' }],
    ['0 por página', { por_pagina: '0' }],
  ])('responde 400 con %s', async (_caso, query) => {
    expectApiError(await pedir(query), { status: 400, codigo: 'VALIDACION' });
    expect(consultar).not.toHaveBeenCalled();
  });

  it.each([
    ['un EMPLEADO', conSesion(), 403, 'SIN_PERMISO'],
    ['nadie (sin token)', {}, 401, 'NO_AUTENTICADO'],
  ])('no se la muestra a %s', async (_quien, sesion, status, codigo) => {
    expectApiError(await pedir({}, sesion), { status, codigo });
    expect(consultar).not.toHaveBeenCalled();
  });
});
