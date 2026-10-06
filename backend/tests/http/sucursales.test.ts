import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sucursal } from '../../src/models/sucursales.model.js';
import { expectApiError, testApi } from '../helpers/api.js';
import { cuerpoDeSucursal, sucursalDePrueba } from '../helpers/sucursales.js';
import { comoAdmin, conSesion } from '../helpers/usuarios.js';

// Igual que en usuarios: se pisan las funciones que hablan con la base y se
// conserva la clase de error REAL, que el controller reconoce con `instanceof`.
vi.mock('../../src/models/sucursales.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/sucursales.model.js')>()),
  registrar: vi.fn(),
  actualizar: vi.fn(),
}));

const modelo = await import('../../src/models/sucursales.model.js');
const registrar = vi.mocked(modelo.registrar);
const actualizar = vi.mocked(modelo.actualizar);

const ADMIN = '33333333-3333-3333-3333-333333333333';
const NORTE = '66666666-6666-6666-6666-666666666666';

/** Lo que guardó el model para un cuerpo de alta. */
function guardadaDe(cuerpo: Record<string, unknown>, campos: Partial<Sucursal> = {}): Sucursal {
  return sucursalDePrueba({
    id: String(cuerpo.id),
    nombre: String(cuerpo.nombre),
    direccion: typeof cuerpo.direccion === 'string' ? cuerpo.direccion : null,
    telefono: typeof cuerpo.telefono === 'string' ? cuerpo.telefono : null,
    ...campos,
  });
}

function alta(cuerpo: Record<string, unknown>, sesion: Record<string, string> = comoAdmin()) {
  return testApi().post('/api/sucursales').set(sesion).send(cuerpo);
}

function edicion(id: string, cuerpo: Record<string, unknown>, sesion: Record<string, string> = comoAdmin()) {
  return testApi().patch(`/api/sucursales/${id}`).set(sesion).send(cuerpo);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/sucursales — SPEC-ALE186-011', () => {
  it('crea la sucursal abierta y responde 201, a nombre del admin de la sesión', async () => {
    const cuerpo = cuerpoDeSucursal({ telefono: '3-3334455' });
    registrar.mockResolvedValue({ sucursal: guardadaDe(cuerpo), creada: true });

    const res = await alta(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: cuerpo.id, nombre: cuerpo.nombre, activa: true });
    expect(registrar).toHaveBeenCalledWith(
      { id: cuerpo.id, nombre: cuerpo.nombre, direccion: 'Av. Banzer 123', telefono: '3-3334455' },
      ADMIN,
    );
  });

  it('dirección y teléfono son opcionales: vacíos se guardan como null', async () => {
    const cuerpo = cuerpoDeSucursal({ direccion: '  ', telefono: undefined });
    registrar.mockResolvedValue({ sucursal: guardadaDe(cuerpo, { direccion: null }), creada: true });

    await alta(cuerpo);

    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ direccion: null, telefono: null }), ADMIN);
  });

  it.each([
    ['un EMPLEADO', conSesion(), 403, 'SIN_PERMISO'],
    ['nadie (sin token)', {}, 401, 'NO_AUTENTICADO'],
  ])('rechaza el alta cuando la pide %s', async (_quien, sesion, status, codigo) => {
    expectApiError(await alta(cuerpoDeSucursal(), sesion), { status, codigo });
    expect(registrar).not.toHaveBeenCalled();
  });

  it.each([
    ['sin id', { id: undefined }],
    ['con un id que no es UUID', { id: '42' }],
    ['sin nombre', { nombre: '   ' }],
    ['con un nombre de más de 100 letras', { nombre: 'S'.repeat(101) }],
    ['con una dirección de más de 200 caracteres', { direccion: 'd'.repeat(201) }],
    ['con un teléfono de más de 30 caracteres', { telefono: '7'.repeat(31) }],
  ])('responde 400 %s', async (_caso, cambio) => {
    expectApiError(await alta(cuerpoDeSucursal(cambio)), { status: 400, codigo: 'VALIDACION' });
    expect(registrar).not.toHaveBeenCalled();
  });

  it('acepta un nombre de exactamente 100 letras', async () => {
    const cuerpo = cuerpoDeSucursal({ nombre: 'S'.repeat(100) });
    registrar.mockResolvedValue({ sucursal: guardadaDe(cuerpo), creada: true });

    expect((await alta(cuerpo)).status).toBe(201);
  });

  it('responde 409 NOMBRE_SUCURSAL_DUPLICADO, con qué hacer, cuando el nombre ya es de otra', async () => {
    registrar.mockRejectedValue(new modelo.NombreOcupadoError('Central'));

    const res = await alta(cuerpoDeSucursal({ nombre: 'Central' }));

    expectApiError(res, { status: 409, codigo: 'NOMBRE_SUCURSAL_DUPLICADO' });
    expect(res.body.error.mensaje).toMatch(/Elegí otro nombre/);
  });

  it('en un reintento con los mismos datos responde 200 con la que ya estaba', async () => {
    const cuerpo = cuerpoDeSucursal();
    registrar.mockResolvedValue({ sucursal: guardadaDe(cuerpo), creada: false });

    expect((await alta(cuerpo)).status).toBe(200);
  });

  it('responde 409 cuando el id ya existe con datos distintos', async () => {
    const cuerpo = cuerpoDeSucursal();
    registrar.mockResolvedValue({ sucursal: guardadaDe(cuerpo, { nombre: 'Otra' }), creada: false });

    expectApiError(await alta(cuerpo), { status: 409, codigo: 'CONFLICTO' });
  });
});

describe('PATCH /api/sucursales/:id — SPEC-ALE186-011', () => {
  beforeEach(() => {
    actualizar.mockImplementation(async (id, cambios) => ({
      tipo: 'actualizada',
      sucursal: sucursalDePrueba({ id, ...cambios }),
    }));
  });

  it('aplica solo los campos que vinieron, e ignora el resto, a nombre del admin', async () => {
    const res = await edicion(NORTE, { nombre: 'Norte', telefono: '', id: 'otro', creada: 'ayer' });

    expect(res.status).toBe(200);
    expect(actualizar).toHaveBeenCalledWith(NORTE, { nombre: 'Norte', telefono: null }, ADMIN);
  });

  it('cierra y reabre con activa', async () => {
    expect((await edicion(NORTE, { activa: false })).body.activa).toBe(false);
    expect((await edicion(NORTE, { activa: true })).body.activa).toBe(true);
  });

  it.each([
    ['un nombre vacío', { nombre: '' }],
    ['un nombre de más de 100 letras', { nombre: 'S'.repeat(101) }],
    ['una dirección de más de 200 caracteres', { direccion: 'd'.repeat(201) }],
    ['un teléfono de más de 30 caracteres', { telefono: '7'.repeat(31) }],
    ['un activa que no es booleano', { activa: 'no' }],
  ])('responde 400 al mandar %s', async (_caso, cuerpo) => {
    expectApiError(await edicion(NORTE, cuerpo), { status: 400, codigo: 'VALIDACION' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('responde 400 cuando el id de la ruta no es un UUID', async () => {
    expectApiError(await edicion('42', { nombre: 'Norte' }), { status: 400, codigo: 'VALIDACION' });
  });

  it('responde 404 cuando la sucursal no existe', async () => {
    actualizar.mockResolvedValue({ tipo: 'no-encontrada' });

    expectApiError(await edicion(NORTE, { nombre: 'Norte' }), { status: 404, codigo: 'NO_ENCONTRADO' });
  });

  it('responde 409 NOMBRE_SUCURSAL_DUPLICADO cuando el nombre nuevo es de otra', async () => {
    actualizar.mockResolvedValue({ tipo: 'nombre-ocupado' });

    const res = await edicion(NORTE, { nombre: 'Central' });

    expectApiError(res, { status: 409, codigo: 'NOMBRE_SUCURSAL_DUPLICADO' });
    expect(res.body.error.mensaje).toContain('"Central"');
  });

  it.each([
    [1, 'Queda 1 orden'],
    [3, 'Quedan 3 órdenes'],
  ])('responde 409 SUCURSAL_CON_ROPA diciendo cuántas quedan (%i)', async (cantidad, texto) => {
    actualizar.mockResolvedValue({ tipo: 'con-ropa-abierta', cantidad });

    const res = await edicion(NORTE, { activa: false });

    expectApiError(res, { status: 409, codigo: 'SUCURSAL_CON_ROPA' });
    expect(res.body.error.mensaje).toContain(texto);
  });

  it.each([
    ['un EMPLEADO', conSesion(), 403, 'SIN_PERMISO'],
    ['nadie (sin token)', {}, 401, 'NO_AUTENTICADO'],
  ])('rechaza la edición cuando la pide %s', async (_quien, sesion, status, codigo) => {
    expectApiError(await edicion(NORTE, { activa: false }, sesion), { status, codigo });
    expect(actualizar).not.toHaveBeenCalled();
  });
});
