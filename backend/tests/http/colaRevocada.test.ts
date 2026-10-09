import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VENTANA_COLA_SEGUNDOS } from '../../src/utils/jwt.js';
import { expectApiError, testApi } from '../helpers/api.js';
import { cuerpoDeAlta } from '../helpers/clientes.js';
import { ID_DE_SESION, conSesion, conTokenVencidoHace, usuarioDePrueba } from '../helpers/usuarios.js';

// Qué deja pasar la sesión de la cola y qué marca le pasa al model. Las
// escrituras se reemplazan por dobles: acá importa la puerta, no la base. Que la
// marca quede de verdad en la auditoría está en tests/db/colaRevocada.db.test.ts.
vi.mock('../../src/models/usuarios.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/usuarios.model.js')>()),
  buscarPorId: vi.fn(),
}));
vi.mock('../../src/models/clientes.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/clientes.model.js')>()),
  crear: vi.fn(),
}));

const buscarPorId = vi.mocked((await import('../../src/models/usuarios.model.js')).buscarPorId);
const crear = vi.mocked((await import('../../src/models/clientes.model.js')).crear);

const DIA = 24 * 60 * 60;

function altaDeCliente(sesion: { Authorization: string }) {
  return testApi().post('/api/clientes').set(sesion).send(cuerpoDeAlta());
}

beforeEach(async () => {
  vi.clearAllMocks();
  buscarPorId.mockResolvedValue(await usuarioDePrueba({ id: ID_DE_SESION }));
  crear.mockImplementation(async (cliente) => ({
    cliente: { ...cliente, fechaRegistro: '2026-10-09 10:00:00' },
    creado: true,
  }));
});

describe('La cola del mostrador con un token vencido — SPEC-ALE186-018', () => {
  it('acepta un token vencido hace un día, a nombre de quien lo tenía y sin marca si la cuenta está activa', async () => {
    const res = await altaDeCliente(conTokenVencidoHace(DIA));

    expect(res.status).toBe(201);
    expect(crear).toHaveBeenCalledWith(expect.any(Object), ID_DE_SESION, null);
  });

  it('rechaza con 401 un token vencido hace más de 3 días, sin tocar nada', async () => {
    expectApiError(await altaDeCliente(conTokenVencidoHace(VENTANA_COLA_SEGUNDOS + 60)), {
      status: 401,
      codigo: 'NO_AUTENTICADO',
    });
    expect(crear).not.toHaveBeenCalled();
  });

  it.each([
    ['renovar la sesión', (s: { Authorization: string }) => testApi().post('/api/auth/renovar').set(s)],
    ['ver la auditoría', (s: { Authorization: string }) => testApi().get('/api/auditoria').set(s)],
    ['ver las estadísticas', (s: { Authorization: string }) => testApi().get('/api/estadisticas/ingresos').set(s)],
    ['dar de alta una cuenta', (s: { Authorization: string }) => testApi().post('/api/usuarios').set(s).send({})],
    ['dar de alta una sucursal', (s: { Authorization: string }) => testApi().post('/api/sucursales').set(s).send({})],
  ])('un token vencido, aunque esté dentro de la ventana, no sirve para %s', async (_caso, pedir) => {
    const vencidoDeAdmin = conTokenVencidoHace(DIA, { rol: 'ADMIN', sucursalId: null });

    expectApiError(await pedir(vencidoDeAdmin), { status: 401, codigo: 'NO_AUTENTICADO' });
  });
});

describe('Lo que sube una cuenta dada de baja — SPEC-ALE186-018', () => {
  beforeEach(async () => {
    buscarPorId.mockResolvedValue(await usuarioDePrueba({ id: ID_DE_SESION, activo: false }));
  });

  it.each([
    ['con el token todavía vigente', conSesion()],
    ['con el token vencido dentro de la ventana', conTokenVencidoHace(DIA)],
  ])('se acepta %s, pero marcado para que el admin lo revise', async (_caso, sesion) => {
    const res = await altaDeCliente(sesion);

    expect(res.status).toBe(201);
    expect(crear).toHaveBeenCalledWith(expect.any(Object), ID_DE_SESION, 'cuenta_dada_de_baja');
  });

  it('la comprobación consulta la base en cada escritura de la cola', async () => {
    await altaDeCliente(conSesion());
    await altaDeCliente(conSesion());

    expect(buscarPorId).toHaveBeenCalledTimes(2);
  });
});
