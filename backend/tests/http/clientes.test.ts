import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';
import { clienteDePrueba, cuerpoDeAlta } from '../helpers/clientes.js';
import { ID_DE_SESION, conSesion } from '../helpers/usuarios.js';

// Se reemplazan las funciones del model, pero se conserva la clase de error
// REAL: el controller la reconoce con `instanceof`, y una copia del doble no
// sería la misma clase. `importOriginal` trae el módulo verdadero y encima se
// pisan solo las funciones que hablan con la base.
vi.mock('../../src/models/clientes.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/clientes.model.js')>()),
  crear: vi.fn(),
  actualizar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorTelefono: vi.fn(),
}));

const modelo = await import('../../src/models/clientes.model.js');
const crear = vi.mocked(modelo.crear);
const actualizar = vi.mocked(modelo.actualizar);
const buscarPorTelefono = vi.mocked(modelo.buscarPorTelefono);
const { TelefonoOcupadoError } = modelo;

const SUCURSAL = '22222222-2222-2222-2222-222222222222';

function alta(cuerpo: Record<string, unknown>, sesion = conSesion()) {
  return testApi().post('/api/clientes').set(sesion).send(cuerpo);
}

function edicion(id: string, cuerpo: Record<string, unknown>) {
  return testApi().patch(`/api/clientes/${id}`).set(conSesion()).send(cuerpo);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/clientes — SPEC-ALE186-003', () => {
  it('crea el cliente con el id del dispositivo y responde 201', async () => {
    const cuerpo = cuerpoDeAlta();
    crear.mockResolvedValue({ cliente: clienteDePrueba({ id: String(cuerpo.id) }), creado: true });

    const res = await alta(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(cuerpo.id);
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ id: cuerpo.id }), ID_DE_SESION);
  });

  it('en un reintento responde 200 con el que ya existía', async () => {
    // Para la cola de subida los dos son éxito: lo que importa es que un
    // reintento no se convierta en un error que el empleado tenga que atender.
    crear.mockResolvedValue({ cliente: clienteDePrueba(), creado: false });

    const res = await alta(cuerpoDeAlta());

    expect(res.status).toBe(200);
  });

  it.each([
    ['falta', { id: undefined }],
    ['no es un UUID', { id: '001234' }],
  ])('responde 400 cuando el id %s', async (_caso, cambio) => {
    const res = await alta(cuerpoDeAlta(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('guarda el teléfono solo con dígitos', async () => {
    crear.mockResolvedValue({ cliente: clienteDePrueba(), creado: true });

    await alta(cuerpoDeAlta({ telefono: ' 7012-3456 ' }));

    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ telefono: '70123456' }), ID_DE_SESION);
  });

  it.each([
    ['sin nombre', { nombre: undefined }],
    ['con el nombre en blanco', { nombre: '   ' }],
    ['sin teléfono', { telefono: undefined }],
    ['con un teléfono sin ningún dígito', { telefono: 'no tiene' }],
  ])('responde 400 %s, sin tocar la base', async (_caso, cambio) => {
    const res = await alta(cuerpoDeAlta(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('toma la sucursal de la sesión e ignora la que venga en el cuerpo', async () => {
    crear.mockResolvedValue({ cliente: clienteDePrueba(), creado: true });

    await alta(
      cuerpoDeAlta({ sucursalRegistroId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
      conSesion({ sucursalId: SUCURSAL }),
    );

    // Si valiera la del cuerpo, un empleado podría registrar clientes a nombre
    // de otra tienda con solo escribirla.
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ sucursalRegistroId: SUCURSAL }), ID_DE_SESION);
  });

  it('un ADMIN registra sin sucursal', async () => {
    crear.mockResolvedValue({ cliente: clienteDePrueba(), creado: true });

    await alta(cuerpoDeAlta(), conSesion({ rol: 'ADMIN', sucursalId: null }));

    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ sucursalRegistroId: null }), ID_DE_SESION);
  });

  it('responde 409 diciendo a nombre de quién está el teléfono', async () => {
    crear.mockRejectedValue(new TelefonoOcupadoError('70123456'));
    buscarPorTelefono.mockResolvedValue(clienteDePrueba({ nombre: 'Rosa Mamani' }));

    const res = await alta(cuerpoDeAlta());

    expectApiError(res, { status: 409, codigo: 'TELEFONO_DUPLICADO' });
    expect(res.body.error.mensaje).toContain('Rosa Mamani');
  });

  it('exige sesión', async () => {
    const res = await testApi().post('/api/clientes').send(cuerpoDeAlta());

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
    expect(crear).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/clientes/:id — SPEC-ALE186-003', () => {
  const ID = '44444444-4444-4444-4444-444444444444';

  it('actualiza y devuelve el cliente', async () => {
    actualizar.mockResolvedValue(clienteDePrueba({ nombre: 'Ana María Quispe' }));

    const res = await edicion(ID, { nombre: 'Ana María Quispe' });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Ana María Quispe');
    expect(actualizar).toHaveBeenCalledWith(ID, { nombre: 'Ana María Quispe' }, ID_DE_SESION);
  });

  it('normaliza también el teléfono al editarlo', async () => {
    actualizar.mockResolvedValue(clienteDePrueba());

    await edicion(ID, { telefono: '7012-3456' });

    expect(actualizar).toHaveBeenCalledWith(ID, { telefono: '70123456' }, ID_DE_SESION);
  });

  it('deja vaciar el carnet', async () => {
    actualizar.mockResolvedValue(clienteDePrueba());

    await edicion(ID, { carnet: '' });

    expect(actualizar).toHaveBeenCalledWith(ID, { carnet: null }, ID_DE_SESION);
  });

  it('solo aplica nombre, teléfono y carnet: el resto del cuerpo no llega al model', async () => {
    actualizar.mockResolvedValue(clienteDePrueba());

    await edicion(ID, {
      nombre: 'Ana',
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      fechaRegistro: '2000-01-01 00:00:00',
      sucursalRegistroId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });

    expect(actualizar).toHaveBeenCalledWith(ID, { nombre: 'Ana' }, ID_DE_SESION);
  });

  it('responde 404 cuando el cliente no existe', async () => {
    actualizar.mockResolvedValue(null);

    expectApiError(await edicion(ID, { nombre: 'Ana' }), { status: 404, codigo: 'NO_ENCONTRADO' });
  });

  it('responde 409 cuando el teléfono nuevo es de otro cliente', async () => {
    actualizar.mockRejectedValue(new TelefonoOcupadoError('71111111'));
    buscarPorTelefono.mockResolvedValue(clienteDePrueba({ nombre: 'Luis Choque' }));

    const res = await edicion(ID, { telefono: '71111111' });

    expectApiError(res, { status: 409, codigo: 'TELEFONO_DUPLICADO' });
    expect(res.body.error.mensaje).toContain('Luis Choque');
  });

  it('responde 400 y no consulta la base con un id que no es UUID', async () => {
    // Sin esta validación, Postgres rechazaría el id con un error de tipo y el
    // cliente recibiría un 500 por algo que es culpa de su petición.
    expectApiError(await edicion('no-es-un-uuid', { nombre: 'Ana' }), {
      status: 400,
      codigo: 'VALIDACION',
    });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('responde 400 si intenta dejar el nombre vacío', async () => {
    expectApiError(await edicion(ID, { nombre: '  ' }), { status: 400, codigo: 'VALIDACION' });
  });

  it('exige sesión', async () => {
    const res = await testApi().patch(`/api/clientes/${ID}`).send({ nombre: 'Ana' });

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
  });
});
