import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Usuario } from '../../src/models/usuarios.model.js';
import { expectApiError, testApi } from '../helpers/api.js';
import {
  comoAdmin,
  conSesion,
  cuerpoDeAltaUsuario,
  usuarioDePrueba,
} from '../helpers/usuarios.js';

// Igual que en clientes: se pisan las funciones que hablan con la base y se
// conserva la clase de error REAL, que el controller reconoce con `instanceof`.
vi.mock('../../src/models/usuarios.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/usuarios.model.js')>()),
  registrar: vi.fn(),
  actualizar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorUsername: vi.fn(),
}));
vi.mock('../../src/models/sucursales.model.js', () => ({ buscarPorId: vi.fn() }));

const modelo = await import('../../src/models/usuarios.model.js');
const registrar = vi.mocked(modelo.registrar);
const actualizar = vi.mocked(modelo.actualizar);
const buscarPorId = vi.mocked(modelo.buscarPorId);
const buscarPorUsername = vi.mocked(modelo.buscarPorUsername);
const buscarSucursal = vi.mocked((await import('../../src/models/sucursales.model.js')).buscarPorId);

const ADMIN = '33333333-3333-3333-3333-333333333333';
const SUCURSAL = '22222222-2222-2222-2222-222222222222';
const EMPLEADA = '55555555-5555-5555-5555-555555555555';

const SUCURSAL_ABIERTA = { id: SUCURSAL, nombre: 'Central', direccion: null, telefono: null, activa: true };

/** Lo que guardó el model para un cuerpo de alta: la misma cuenta, sin hash. */
function guardadoDe(cuerpo: Record<string, unknown>, campos: Partial<Usuario> = {}): Usuario {
  return {
    id: String(cuerpo.id),
    nombreCompleto: String(cuerpo.nombre_completo),
    username: String(cuerpo.username),
    rol: cuerpo.rol === 'ADMIN' ? 'ADMIN' : 'EMPLEADO',
    sucursalId: typeof cuerpo.sucursal_id === 'string' ? cuerpo.sucursal_id : null,
    telefono: typeof cuerpo.telefono === 'string' ? cuerpo.telefono : null,
    activo: true,
    ...campos,
  };
}

function alta(cuerpo: Record<string, unknown>, sesion: Record<string, string> = comoAdmin()) {
  return testApi().post('/api/usuarios').set(sesion).send(cuerpo);
}

function edicion(id: string, cuerpo: Record<string, unknown>, sesion: Record<string, string> = comoAdmin()) {
  return testApi().patch(`/api/usuarios/${id}`).set(sesion).send(cuerpo);
}

beforeEach(() => {
  vi.clearAllMocks();
  buscarSucursal.mockResolvedValue(SUCURSAL_ABIERTA);
});

describe('POST /api/usuarios — SPEC-ALE186-009', () => {
  it('crea el empleado, hashea la contraseña, anota al admin y responde 201 sin hash', async () => {
    const cuerpo = cuerpoDeAltaUsuario({ telefono: '70011122' });
    registrar.mockResolvedValue({ usuario: guardadoDe(cuerpo), creado: true });

    const res = await alta(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(guardadoDe(cuerpo));
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);

    const enviado = registrar.mock.calls[0]?.[0];
    expect(enviado).toMatchObject({
      id: cuerpo.id,
      rol: 'EMPLEADO',
      sucursalId: SUCURSAL,
      telefono: '70011122',
      creadoPor: ADMIN,
    });
    // El mismo bcrypt que usa el login: lo que se guardó, el login lo reconoce.
    expect(enviado?.passwordHash).not.toBe(cuerpo.password);
    expect(await bcrypt.compare(String(cuerpo.password), enviado?.passwordHash ?? '')).toBe(true);
  });

  it('toma quién lo creó de la sesión, aunque el cuerpo diga otra cosa', async () => {
    const cuerpo = cuerpoDeAltaUsuario({ creado_por: EMPLEADA });
    registrar.mockResolvedValue({ usuario: guardadoDe(cuerpo), creado: true });

    await alta(cuerpo);

    expect(registrar.mock.calls[0]?.[0].creadoPor).toBe(ADMIN);
  });

  it('crea un ADMIN sin sucursal cuando el rol lo dice', async () => {
    const cuerpo = cuerpoDeAltaUsuario({ rol: 'ADMIN', sucursal_id: undefined });
    registrar.mockResolvedValue({ usuario: guardadoDe(cuerpo), creado: true });

    const res = await alta(cuerpo);

    expect(res.status).toBe(201);
    expect(registrar.mock.calls[0]?.[0]).toMatchObject({ rol: 'ADMIN', sucursalId: null });
    expect(buscarSucursal).not.toHaveBeenCalled();
  });

  it.each([
    ['un EMPLEADO', conSesion(), 403, 'SIN_PERMISO'],
    ['nadie (sin token)', {}, 401, 'NO_AUTENTICADO'],
  ])('rechaza el alta cuando la pide %s', async (_quien, sesion, status, codigo) => {
    const res = await alta(cuerpoDeAltaUsuario(), sesion);

    expectApiError(res, { status, codigo });
    expect(registrar).not.toHaveBeenCalled();
  });

  it.each([
    ['sin id', { id: undefined }],
    ['con un id que no es UUID', { id: '42' }],
    ['sin nombre', { nombre_completo: '  ' }],
    ['sin username', { username: undefined }],
    ['con un username de más de 50 letras', { username: 'u'.repeat(51) }],
    ['siendo EMPLEADO sin sucursal', { sucursal_id: undefined }],
    ['siendo EMPLEADO con sucursal null', { sucursal_id: null }],
    ['con un rol que no existe', { rol: 'SUPERVISOR' }],
    ['siendo ADMIN con sucursal', { rol: 'ADMIN' }],
    ['con una contraseña de 7 caracteres', { password: '1234567' }],
    ['sin contraseña', { password: undefined }],
    ['con una contraseña de más de 72 bytes', { password: 'ñ'.repeat(37) }],
    ['con un teléfono de más de 30 caracteres', { telefono: '7'.repeat(31) }],
  ])('responde 400 %s', async (_caso, cambio) => {
    const res = await alta(cuerpoDeAltaUsuario(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(registrar).not.toHaveBeenCalled();
  });

  it('acepta una contraseña de exactamente 8 caracteres', async () => {
    const cuerpo = cuerpoDeAltaUsuario({ password: '12345678' });
    registrar.mockResolvedValue({ usuario: guardadoDe(cuerpo), creado: true });

    expect((await alta(cuerpo)).status).toBe(201);
  });

  it.each([
    ['no existe', null],
    ['está cerrada', { ...SUCURSAL_ABIERTA, activa: false }],
  ])('responde 404 cuando la sucursal %s', async (_caso, sucursal) => {
    buscarSucursal.mockResolvedValue(sucursal);

    const res = await alta(cuerpoDeAltaUsuario());

    expectApiError(res, { status: 404, codigo: 'NO_ENCONTRADO' });
    expect(registrar).not.toHaveBeenCalled();
  });

  it('responde 409 USERNAME_DUPLICADO, con qué hacer, cuando el username ya es de otra cuenta', async () => {
    registrar.mockRejectedValue(new modelo.UsernameOcupadoError('rosa'));

    const res = await alta(cuerpoDeAltaUsuario());

    expectApiError(res, { status: 409, codigo: 'USERNAME_DUPLICADO' });
    expect(res.body.error.mensaje).toMatch(/Elegí otro/);
  });

  it('en un reintento con los mismos datos responde 200 con la cuenta que ya estaba', async () => {
    const cuerpo = cuerpoDeAltaUsuario();
    registrar.mockResolvedValue({ usuario: guardadoDe(cuerpo), creado: false });

    const res = await alta(cuerpo);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cuerpo.id);
  });

  it('responde 409 cuando el id ya existe con datos distintos', async () => {
    // El model encontró ese id, pero guardado con otro nombre: no es un reintento.
    const cuerpo = cuerpoDeAltaUsuario();
    registrar.mockResolvedValue({
      usuario: guardadoDe(cuerpo, { nombreCompleto: 'Otra Persona' }),
      creado: false,
    });

    const res = await alta(cuerpo);

    expectApiError(res, { status: 409, codigo: 'CONFLICTO' });
  });
});

describe('PATCH /api/usuarios/:id — SPEC-ALE186-009', () => {
  const empleada: Usuario = {
    id: EMPLEADA,
    nombreCompleto: 'Rosa Mamani',
    username: 'rosa',
    rol: 'EMPLEADO',
    sucursalId: SUCURSAL,
    telefono: null,
    activo: true,
  };

  beforeEach(() => {
    buscarPorId.mockResolvedValue(empleada);
    actualizar.mockImplementation(async (_id, cambios) => ({ ...empleada, ...cambios }));
  });

  it('aplica solo los campos que vinieron, e ignora el rol y el username', async () => {
    const res = await edicion(EMPLEADA, {
      nombre_completo: 'Rosa M. Mamani',
      telefono: '',
      rol: 'ADMIN',
      username: 'otra',
    });

    expect(res.status).toBe(200);
    expect(actualizar).toHaveBeenCalledWith(EMPLEADA, {
      nombreCompleto: 'Rosa M. Mamani',
      telefono: null,
    });
    expect(res.body.rol).toBe('EMPLEADO');
  });

  it('cambia la sucursal de un empleado a otra que existe', async () => {
    const otra = '66666666-6666-6666-6666-666666666666';
    buscarSucursal.mockResolvedValue({ ...SUCURSAL_ABIERTA, id: otra });

    await edicion(EMPLEADA, { sucursal_id: otra });

    expect(actualizar).toHaveBeenCalledWith(EMPLEADA, { sucursalId: otra });
  });

  it('guarda la contraseña nueva hasheada, y no la devuelve', async () => {
    const res = await edicion(EMPLEADA, { password: 'otra-clave-segura' });

    const hash = actualizar.mock.calls[0]?.[1].passwordHash ?? '';
    expect(await bcrypt.compare('otra-clave-segura', hash)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);
  });

  it('da de baja con activo: false', async () => {
    const res = await edicion(EMPLEADA, { activo: false });

    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);
  });

  it('responde 404 cuando la cuenta no existe', async () => {
    buscarPorId.mockResolvedValue(null);

    const res = await edicion(EMPLEADA, { activo: false });

    expectApiError(res, { status: 404, codigo: 'NO_ENCONTRADO' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it.each([
    ['dejar a un EMPLEADO sin sucursal', empleada, { sucursal_id: null }],
    ['asignarle sucursal a un ADMIN', { ...empleada, rol: 'ADMIN' as const, sucursalId: null }, { sucursal_id: SUCURSAL }],
    ['un activo que no es booleano', empleada, { activo: 'no' }],
    ['una contraseña corta', empleada, { password: 'corta' }],
    ['un nombre vacío', empleada, { nombre_completo: '' }],
  ])('responde 400 al intentar %s', async (_caso, actual, cuerpo) => {
    buscarPorId.mockResolvedValue(actual);

    const res = await edicion(EMPLEADA, cuerpo);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('responde 404 cuando la sucursal nueva no existe', async () => {
    buscarSucursal.mockResolvedValue(null);

    const res = await edicion(EMPLEADA, { sucursal_id: '66666666-6666-6666-6666-666666666666' });

    expectApiError(res, { status: 404, codigo: 'NO_ENCONTRADO' });
  });

  it('responde 409 BAJA_PROPIA cuando un ADMIN intenta darse de baja a sí mismo', async () => {
    buscarPorId.mockResolvedValue({ ...empleada, id: ADMIN, rol: 'ADMIN', sucursalId: null });

    const res = await edicion(ADMIN, { activo: false }, comoAdmin(ADMIN));

    expectApiError(res, { status: 409, codigo: 'BAJA_PROPIA' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('deja que un ADMIN dé de baja a OTRO admin', async () => {
    const otroAdmin = '77777777-7777-7777-7777-777777777777';
    buscarPorId.mockResolvedValue({ ...empleada, id: otroAdmin, rol: 'ADMIN', sucursalId: null });

    expect((await edicion(otroAdmin, { activo: false })).status).toBe(200);
  });

  it.each([
    ['un EMPLEADO', conSesion(), 403, 'SIN_PERMISO'],
    ['nadie (sin token)', {}, 401, 'NO_AUTENTICADO'],
  ])('rechaza la edición cuando la pide %s', async (_quien, sesion, status, codigo) => {
    const res = await edicion(EMPLEADA, { activo: false }, sesion);

    expectApiError(res, { status, codigo });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('responde 400 cuando el id de la ruta no es un UUID', async () => {
    const res = await edicion('42', { activo: false });

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });
});

describe('Dar de baja corta el acceso — SPEC-ALE186-009', () => {
  // De punta a punta por HTTP, con una "base" en memoria detrás de los dobles:
  // el PATCH de baja escribe ahí, y el login y la renovación leen de ahí. Así se
  // prueba que las tres piezas hablan del mismo `activo`, y no tres respuestas
  // fijadas a mano. La versión contra Postgres real está en tests/db.
  it('después del PATCH activo: false, ni el login ni la renovación dejan entrar', async () => {
    let guardada = await usuarioDePrueba({ id: EMPLEADA, username: 'rosa', contrasena: 'clave-de-rosa' });
    buscarPorId.mockImplementation(async () => guardada);
    buscarPorUsername.mockImplementation(async () => guardada);
    actualizar.mockImplementation(async (_id, cambios) => {
      guardada = { ...guardada, ...cambios };
      return guardada;
    });
    const sesionDeRosa = conSesion({ id: EMPLEADA });

    const antes = await testApi().post('/api/auth/login').send({ username: 'rosa', password: 'clave-de-rosa' });
    expect(antes.status).toBe(200);

    expect((await edicion(EMPLEADA, { activo: false })).status).toBe(200);

    const login = await testApi().post('/api/auth/login').send({ username: 'rosa', password: 'clave-de-rosa' });
    expectApiError(login, { status: 401, codigo: 'NO_AUTENTICADO' });

    const renovar = await testApi().post('/api/auth/renovar').set(sesionDeRosa);
    expectApiError(renovar, { status: 401, codigo: 'NO_AUTENTICADO' });
  });
});
