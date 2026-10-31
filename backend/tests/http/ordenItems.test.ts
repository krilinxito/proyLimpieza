import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';
import { IDS, ordenDePrueba } from '../helpers/ordenes.js';
import { ID_RENGLON, cuerpoDeRenglon, renglonDePrueba } from '../helpers/ordenItems.js';
import { conSesion } from '../helpers/usuarios.js';

// Como en pagos: se reemplaza la función del model que habla con la base, y lo que se prueba es el controller —qué
// valida, qué le pasa al model y cómo traduce cada resultado a HTTP—. Que el SQL haga lo que promete está en el test
// del model y, contra la base real, en tests/db/ordenItems.db.test.ts.
// Las rutas del mostrador miran si la cuenta sigue activa (SPEC-ALE186-018): acá siempre lo está.
vi.mock('../../src/models/usuarios.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/usuarios.model.js')>()),
  buscarPorId: vi.fn(async (id: string) => ({
    id,
    nombreCompleto: 'Cuenta activa',
    username: 'activa',
    rol: 'EMPLEADO' as const,
    sucursalId: null,
    telefono: null,
    activo: true,
  })),
}));
vi.mock('../../src/models/ordenItems.model.js', () => ({ crear: vi.fn() }));

const crear = vi.mocked((await import('../../src/models/ordenItems.model.js')).crear);

const ADMIN = conSesion({ rol: 'ADMIN', sucursalId: null });

function renglon(cuerpo: Record<string, unknown>, sesion = conSesion()) {
  return testApi().post('/api/orden-items').set(sesion).send(cuerpo);
}

function loQueSeCreo() {
  return crear.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  crear.mockResolvedValue({ tipo: 'creado', item: renglonDePrueba() });
});

describe('POST /api/orden-items — SPEC-KRILINXI-068', () => {
  it('registra el renglón con el id del dispositivo y responde 201 con sus datos', async () => {
    const cuerpo = cuerpoDeRenglon({ posicion: 1, cantidad: '2.5', precio_unitario: '12.40' });

    const res = await renglon(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: ID_RENGLON, ordenId: IDS.orden, momento: 'INGRESO' });
    expect(loQueSeCreo()).toEqual({
      id: cuerpo.id,
      ordenId: IDS.orden,
      momento: 'INGRESO',
      posicion: 1,
      descripcion: 'Camisa',
      cantidad: 250,
      precioUnitario: 1240,
      // De la sesión, nunca del cuerpo.
      usuarioId: IDS.usuario,
    });
  });

  it('un cargo al entregar es un renglón de momento ENTREGA', async () => {
    await renglon(cuerpoDeRenglon({ momento: 'ENTREGA', descripcion: 'Recargo por almacenamiento' }));

    expect(loQueSeCreo()).toMatchObject({ momento: 'ENTREGA', descripcion: 'Recargo por almacenamiento' });
  });

  it('un EMPLEADO solo escribe en su sucursal; un ADMIN, en cualquiera', async () => {
    await renglon(cuerpoDeRenglon());
    expect(crear.mock.calls.at(-1)?.[1]).toEqual({ sucursalId: IDS.sucursal });

    await renglon(cuerpoDeRenglon(), ADMIN);
    expect(crear.mock.calls.at(-1)?.[1]).toEqual({ sucursalId: null });
  });

  it('ignora una sucursal y un usuario que vengan en el cuerpo', async () => {
    await renglon(cuerpoDeRenglon({ sucursal_id: IDS.otraSucursal, usuario_id: IDS.cliente }));

    expect(loQueSeCreo()).not.toHaveProperty('sucursalId');
    expect(loQueSeCreo()?.usuarioId).toBe(IDS.usuario);
  });

  it('sin posición, el renglón va primero', async () => {
    await renglon(cuerpoDeRenglon({ posicion: undefined }));

    expect(loQueSeCreo()?.posicion).toBe(0);
  });

  it('en un reintento responde 200 con el renglón que ya existía', async () => {
    crear.mockResolvedValue({ tipo: 'existente', item: renglonDePrueba() });

    const res = await renglon(cuerpoDeRenglon());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ID_RENGLON);
  });

  it.each([
    ['sin id', { id: 'no-es-uuid' }],
    ['sin orden', { orden_id: undefined }],
    ['sin momento', { momento: undefined }],
    ['con un momento que no existe', { momento: 'DESPUES' }],
    ['sin descripción', { descripcion: '   ' }],
    ['con una descripción de más de 150 caracteres', { descripcion: 'x'.repeat(151) }],
    ['con cantidad cero', { cantidad: '0' }],
    ['con cantidad negativa', { cantidad: '-1' }],
    ['con más de dos decimales en la cantidad', { cantidad: '1.255' }],
    ['con una cantidad de mil o más', { cantidad: '1000' }],
    ['con un precio negativo', { precio_unitario: '-5' }],
    ['con un precio que no es un número', { precio_unitario: 'quince' }],
    ['con una posición negativa', { posicion: -1 }],
    ['con una posición con decimales', { posicion: 1.5 }],
    ['con un subtotal que no entra en la base', { cantidad: '999.99', precio_unitario: '99999999.99' }],
  ])('responde 400 %s, sin llegar al model', async (_caso, cambios) => {
    const res = await renglon(cuerpoDeRenglon(cambios));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('acepta un precio de cero (una prenda de cortesía) y 150 caracteres justos', async () => {
    const res = await renglon(cuerpoDeRenglon({ precio_unitario: '0', descripcion: 'x'.repeat(150) }));

    expect(res.status).toBe(201);
  });

  it('responde 400 cuando la orden no existe o es de otra sucursal', async () => {
    crear.mockResolvedValue({ tipo: 'orden-no-encontrada' });

    expectApiError(await renglon(cuerpoDeRenglon()), { status: 400, codigo: 'VALIDACION' });
  });

  it('responde 409 ORDEN_CERRADA nombrando la boleta y diciendo qué hacer', async () => {
    crear.mockResolvedValue({ tipo: 'orden-cerrada', orden: ordenDePrueba({ estado: 'ENTREGADO' }) });

    const res = await renglon(cuerpoDeRenglon());

    expectApiError(res, { status: 409, codigo: 'ORDEN_CERRADA' });
    expect(res.body.error.mensaje).toMatch(/001234.*administrador/);
  });

  it('responde 409 TOTAL_EXCEDIDO con lo que queda por repartir', async () => {
    crear.mockResolvedValue({ tipo: 'total-excedido', orden: ordenDePrueba(), disponible: '5.00' });

    const res = await renglon(cuerpoDeRenglon());

    expectApiError(res, { status: 409, codigo: 'TOTAL_EXCEDIDO' });
    expect(res.body.error.mensaje).toMatch(/001234[\s\S]*Bs 5\.00/);
  });

  it('responde 403 a un EMPLEADO sin sucursal en vez de dejarlo escribir en todas', async () => {
    const res = await renglon(cuerpoDeRenglon(), conSesion({ sucursalId: null }));

    expectApiError(res, { status: 403, codigo: 'SIN_PERMISO' });
  });

  it('responde 401 NO_AUTENTICADO sin un token válido', async () => {
    const res = await testApi().post('/api/orden-items').send(cuerpoDeRenglon());

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
  });

  it('no tiene edición ni borrado: el mostrador no corrige un renglón guardado', async () => {
    const patch = await testApi().patch(`/api/orden-items/${ID_RENGLON}`).set(conSesion()).send({ cantidad: '1' });
    const borrado = await testApi().delete(`/api/orden-items/${ID_RENGLON}`).set(conSesion());

    expect(patch.status).toBe(404);
    expect(borrado.status).toBe(404);
  });
});
