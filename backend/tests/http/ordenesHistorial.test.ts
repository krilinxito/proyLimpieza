import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';
import { comoAdmin, conSesion } from '../helpers/usuarios.js';

// El model es un doble: lo que se prueba acá es el controller —qué filtros le
// pasa y qué responde a cada entrada—. Que la consulta filtre y sume bien de
// verdad está en tests/db/ordenesHistorial.db.test.ts.
vi.mock('../../src/models/ordenes.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/ordenes.model.js')>()),
  listar: vi.fn(),
}));

const listar = vi.mocked((await import('../../src/models/ordenes.model.js')).listar);

const SUCURSAL = '22222222-2222-2222-2222-222222222222';

const BOLETA = {
  id: '55555555-5555-5555-5555-555555555555',
  numeroBoleta: '001234',
  sucursal: { id: SUCURSAL, nombre: 'Centro' },
  cliente: { id: '44444444-4444-4444-4444-444444444444', nombre: 'Rosa Quispe', telefono: '70123456' },
  descripcion: '2 camisas, 1 terno',
  estado: 'ENTREGADO' as const,
  fechaEntrada: '2026-09-30 10:15:00',
  fechaEstimadaSalida: '2026-10-03',
  precioTotal: '45.50',
  precioFinal: '50.00',
  retiro: { tipo: 'SIN_BOLETA' as const, nombre: 'Luis Mamani', carnet: '1234567 LP' },
  reembolso: null,
  pagado: '20.00',
  saldo: '30.00',
  // SPEC-KRILINXI-068: los renglones de la boleta, con los números como texto.
  renglones: [
    {
      id: '88888888-8888-8888-8888-888888888888',
      momento: 'INGRESO' as const,
      descripcion: 'Camisa',
      cantidad: '2.00',
      precioUnitario: '22.75',
      subtotal: '45.50',
    },
  ],
};

const SIN_FILTROS = {
  desde: null,
  hasta: null,
  sucursalId: null,
  estado: null,
  texto: null,
  conSaldo: false,
};

function pedir(query: Record<string, string> = {}, sesion: Record<string, string> = comoAdmin()) {
  return testApi().get('/api/ordenes').query(query).set(sesion);
}

beforeEach(() => {
  vi.clearAllMocks();
  listar.mockResolvedValue({ total: 1, boletas: [BOLETA] });
});

describe('GET /api/ordenes — SPEC-KRILINXI-040', () => {
  it('responde la página con la paginación, el total y las boletas, con los montos como texto', async () => {
    const res = await pedir({ desde: '2026-09-01', hasta: '2026-09-30' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      pagina: 1,
      porPagina: 50,
      total: 1,
      boletas: [BOLETA],
    });
    expect(typeof res.body.boletas[0].saldo).toBe('string');
  });

  it('sin filtros trae todo el historial: no pone el período de los últimos 30 días', async () => {
    const res = await pedir();

    expect(res.body.desde).toBeNull();
    expect(res.body.hasta).toBeNull();
    expect(listar).toHaveBeenCalledWith(SIN_FILTROS, { pagina: 1, porPagina: 50 });
  });

  it('pasa al model todos los filtros que vinieron, combinados', async () => {
    await pedir({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      sucursal_id: SUCURSAL,
      estado: 'RECIBIDO',
      texto: '  Rosa  ',
      con_saldo: 'true',
      pagina: '3',
      por_pagina: '200',
    });

    expect(listar).toHaveBeenCalledWith(
      {
        desde: '2026-09-01',
        hasta: '2026-09-30',
        sucursalId: SUCURSAL,
        estado: 'RECIBIDO',
        texto: 'Rosa',
        conSaldo: true,
      },
      { pagina: 3, porPagina: 200 },
    );
  });

  it('con solo `hasta` (o solo `desde`), el otro extremo queda abierto', async () => {
    await pedir({ hasta: '2026-09-30' });
    await pedir({ desde: '2026-09-01' });

    expect(listar).toHaveBeenNthCalledWith(1, { ...SIN_FILTROS, hasta: '2026-09-30' }, expect.anything());
    expect(listar).toHaveBeenNthCalledWith(2, { ...SIN_FILTROS, desde: '2026-09-01' }, expect.anything());
  });

  it('un texto en blanco es como no buscar nada', async () => {
    await pedir({ texto: '   ' });

    expect(listar).toHaveBeenCalledWith(SIN_FILTROS, expect.anything());
  });

  it('con_saldo=false es lo mismo que no ponerlo', async () => {
    await pedir({ con_saldo: 'false' });

    expect(listar).toHaveBeenCalledWith(SIN_FILTROS, expect.anything());
  });

  it.each([
    ['una fecha mal escrita', { desde: '10/03/2026' }],
    ['una fecha que no existe', { hasta: '2026-02-30' }],
    ['desde después de hasta', { desde: '2026-03-31', hasta: '2026-03-01' }],
    ['una sucursal que no es UUID', { sucursal_id: '42' }],
    ['un estado que no existe', { estado: 'PERDIDO' }],
    ['un estado en minúsculas', { estado: 'listo' }],
    ['con_saldo que no es true ni false', { con_saldo: 'si' }],
    ['un texto demasiado largo', { texto: 'a'.repeat(101) }],
    ['la página 0', { pagina: '0' }],
    ['una página que no es entera', { pagina: '1.5' }],
    ['más de 200 por página', { por_pagina: '201' }],
    ['0 por página', { por_pagina: '0' }],
  ])('responde 400 con %s', async (_caso, query) => {
    expectApiError(await pedir(query), { status: 400, codigo: 'VALIDACION' });
    expect(listar).not.toHaveBeenCalled();
  });

  it('responde 400 si un filtro viene repetido (llega como lista)', async () => {
    const res = await testApi().get('/api/ordenes?estado=RECIBIDO&estado=ANULADO').set(comoAdmin());

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(listar).not.toHaveBeenCalled();
  });

  it.each([
    ['un EMPLEADO', conSesion(), 403, 'SIN_PERMISO'],
    ['nadie (sin token)', {}, 401, 'NO_AUTENTICADO'],
  ])('no se lo muestra a %s', async (_quien, sesion, status, codigo) => {
    expectApiError(await pedir({}, sesion), { status, codigo });
    expect(listar).not.toHaveBeenCalled();
  });
});
