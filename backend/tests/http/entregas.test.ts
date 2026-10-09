import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';
import { ID_ENTREGA, cuerpoDeEntrega, cuerpoSinBoleta, entregaDePrueba } from '../helpers/entregas.js';
import { IDS, ordenDePrueba } from '../helpers/ordenes.js';
import { conSesion } from '../helpers/usuarios.js';

// Como en pagos: se reemplaza la función del model que habla con la base. Acá
// se prueba el controller —qué valida, qué le pasa al model, cómo traduce cada
// resultado—; que la sentencia haga lo que promete es cosa del test del model.
// Las rutas del mostrador miran si la cuenta sigue activa (SPEC-ALE186-018). Acá no
// hay base: la cuenta de la sesión siempre está activa. El caso de una dada de baja
// está en tests/http/colaRevocada.test.ts.
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
vi.mock('../../src/models/entregas.model.js', () => ({ crear: vi.fn() }));

const crear = vi.mocked((await import('../../src/models/entregas.model.js')).crear);

const ADMIN = conSesion({ rol: 'ADMIN', sucursalId: null });

function retiro(cuerpo: Record<string, unknown>, sesion = conSesion()) {
  return testApi().post('/api/entregas').set(sesion).send(cuerpo);
}

function loQueSeCreo() {
  return crear.mock.calls.at(-1)?.[0];
}
function restricciones() {
  return crear.mock.calls.at(-1)?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  crear.mockResolvedValue({ tipo: 'creada', entrega: entregaDePrueba() });
});

describe('POST /api/entregas — SPEC-ALE186-006', () => {
  it('registra la entrega con el id del dispositivo y responde 201 con sus datos', async () => {
    const cuerpo = cuerpoDeEntrega({ precio_final: '50.00', fecha_entrega: '2026-10-03T13:30:00-04:00' });

    const res = await retiro(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: ID_ENTREGA, ordenId: IDS.orden, tipoRetiro: 'CON_BOLETA' });
    expect(loQueSeCreo()).toEqual({
      id: cuerpo.id,
      ordenId: IDS.orden,
      tipoRetiro: 'CON_BOLETA',
      retiradoPorNombre: null,
      retiradoPorCarnet: null,
      precioFinal: 5000,
      fechaEntrega: '2026-10-03T13:30:00-04:00',
      usuarioEntregaId: IDS.usuario,
    });
  });

  it('un ADMIN también entrega, y sin límite de sucursal', async () => {
    const res = await retiro(cuerpoDeEntrega(), ADMIN);

    expect(res.status).toBe(201);
    expect(restricciones()).toEqual({ sucursalId: null });
  });

  it('un EMPLEADO solo entrega órdenes de su sucursal: la ropa se retira donde se dejó', async () => {
    await retiro(cuerpoDeEntrega());

    expect(restricciones()).toEqual({ sucursalId: IDS.sucursal });
  });

  it('en un reintento responde 200 con la entrega que ya existía', async () => {
    crear.mockResolvedValue({ tipo: 'existente', entrega: entregaDePrueba() });

    const res = await retiro(cuerpoDeEntrega());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ID_ENTREGA });
  });

  it.each([
    ['falta', { id: undefined }],
    ['no es un UUID', { id: 'entrega-1' }],
  ])('responde 400 cuando el id %s', async (_caso, cambio) => {
    const res = await retiro(cuerpoDeEntrega(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('toma quien entrega de la sesión, nunca del cuerpo', async () => {
    await retiro(cuerpoDeEntrega({ usuario_entrega_id: IDS.cliente }));

    expect(loQueSeCreo()).toMatchObject({ usuarioEntregaId: IDS.usuario });
  });

  it.each([
    ['un EMPLEADO', conSesion()],
    ['un ADMIN', ADMIN],
  ])('ignora el sucursal_id del cuerpo cuando entrega %s: sale de la orden', async (_caso, sesion) => {
    await retiro(cuerpoDeEntrega({ sucursal_id: IDS.otraSucursal }), sesion);

    expect(loQueSeCreo()).not.toHaveProperty('sucursalId');
    expect(restricciones()?.sucursalId).not.toBe(IDS.otraSucursal);
  });

  it.each([
    ['falta', { orden_id: undefined }],
    ['no es un UUID', { orden_id: '001234' }],
  ])('responde 400 cuando la orden %s', async (_caso, cambio) => {
    const res = await retiro(cuerpoDeEntrega(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('responde 400 cuando la orden no existe o es de otra sucursal', async () => {
    crear.mockResolvedValue({ tipo: 'orden-no-encontrada' });

    const res = await retiro(cuerpoDeEntrega());

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });

  it('responde 409 ORDEN_ANULADA, nombrando la boleta y diciendo qué hacer', async () => {
    crear.mockResolvedValue({ tipo: 'orden-anulada', orden: ordenDePrueba({ estado: 'ANULADO' }) });

    const res = await retiro(cuerpoDeEntrega());

    expectApiError(res, { status: 409, codigo: 'ORDEN_ANULADA' });
    expect(res.body.error.mensaje).toContain('001234');
    expect(res.body.error.mensaje).toContain('avisale al administrador');
  });

  it('responde 409 ORDEN_YA_ENTREGADA, nombrando la boleta', async () => {
    crear.mockResolvedValue({ tipo: 'orden-ya-entregada', orden: ordenDePrueba({ estado: 'ENTREGADO' }) });

    const res = await retiro(cuerpoDeEntrega());

    expectApiError(res, { status: 409, codigo: 'ORDEN_YA_ENTREGADA' });
    expect(res.body.error.mensaje).toContain('001234');
  });

  it.each([
    ['sin tipo de retiro', { tipo_retiro: undefined }],
    ['con un tipo de retiro que no existe', { tipo_retiro: 'CON_FOTO' }],
    ['con el tipo en minúsculas', { tipo_retiro: 'con_boleta' }],
  ])('responde 400 %s', async (_caso, cambio) => {
    const res = await retiro(cuerpoDeEntrega(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('sin boleta, guarda el nombre y el carnet de quien retira, sin espacios en los bordes', async () => {
    const res = await retiro(
      cuerpoSinBoleta({ retirado_por_nombre: '  Luis Mamani ', retirado_por_carnet: ' 1234567 LP ' }),
    );

    expect(res.status).toBe(201);
    expect(loQueSeCreo()).toMatchObject({
      tipoRetiro: 'SIN_BOLETA',
      retiradoPorNombre: 'Luis Mamani',
      retiradoPorCarnet: '1234567 LP',
    });
  });

  it.each([
    ['sin nombre', { retirado_por_nombre: undefined }],
    ['sin carnet', { retirado_por_carnet: undefined }],
    ['con el nombre en blanco', { retirado_por_nombre: '   ' }],
    ['con el carnet en blanco', { retirado_por_carnet: ' ' }],
    ['sin ninguno de los dos', { retirado_por_nombre: null, retirado_por_carnet: null }],
  ])('responde 400 a un retiro sin boleta %s', async (_caso, cambio) => {
    const res = await retiro(cuerpoSinBoleta(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(res.body.error.mensaje).toContain('nombre y el carnet');
    expect(crear).not.toHaveBeenCalled();
  });

  it('con boleta, nombre y carnet son opcionales', async () => {
    const res = await retiro(cuerpoDeEntrega());

    expect(res.status).toBe(201);
    expect(loQueSeCreo()).toMatchObject({ retiradoPorNombre: null, retiradoPorCarnet: null });
  });

  it.each([
    ['un nombre de más de 150 caracteres', { retirado_por_nombre: 'a'.repeat(151) }],
    ['un carnet de más de 30 caracteres', { retirado_por_carnet: '1'.repeat(31) }],
  ])('responde 400 con %s', async (_caso, cambio) => {
    const res = await retiro(cuerpoSinBoleta(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('acepta un nombre de 150 caracteres y un carnet de 30 justos', async () => {
    const res = await retiro(
      cuerpoSinBoleta({ retirado_por_nombre: 'a'.repeat(150), retirado_por_carnet: '1'.repeat(30) }),
    );

    expect(res.status).toBe(201);
  });

  it('sin precio final, deja que el model use el precio de la orden', async () => {
    await retiro(cuerpoDeEntrega());

    expect(loQueSeCreo()).toMatchObject({ precioFinal: null });
  });

  it.each([
    ['como texto', '45.50', 4550],
    ['como número', 45.5, 4550],
    ['cero (se perdonó el cobro)', '0', 0],
  ])('acepta el precio final %s y lo manda en centavos', async (_caso, precio, centavos) => {
    const res = await retiro(cuerpoDeEntrega({ precio_final: precio }));

    expect(res.status).toBe(201);
    expect(loQueSeCreo()).toMatchObject({ precioFinal: centavos });
  });

  it.each([
    ['que no es un número', 'cuarenta'],
    ['con más de dos decimales', '45.505'],
    ['negativo', '-1'],
    ['que no entra en la columna', '100000000.00'],
  ])('responde 400 con un precio final %s', async (_caso, precio) => {
    const res = await retiro(cuerpoDeEntrega({ precio_final: precio }));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('sin fecha_entrega, deja que la ponga el servidor', async () => {
    await retiro(cuerpoDeEntrega());

    expect(loQueSeCreo()).toMatchObject({ fechaEntrega: null });
  });

  it.each([
    ['no es una fecha', 'mañana'],
    ['no trae zona horaria', '2026-10-03T13:30:00'],
  ])('responde 400 cuando fecha_entrega %s', async (_caso, fecha) => {
    const res = await retiro(cuerpoDeEntrega({ fecha_entrega: fecha }));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('responde 403 a un EMPLEADO sin sucursal en vez de dejarlo entregar en todas', async () => {
    const res = await retiro(cuerpoDeEntrega(), conSesion({ sucursalId: null }));

    expectApiError(res, { status: 403, codigo: 'SIN_PERMISO' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('responde 401 NO_AUTENTICADO sin un token válido', async () => {
    const res = await testApi().post('/api/entregas').send(cuerpoDeEntrega());

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
    expect(crear).not.toHaveBeenCalled();
  });
});

describe('/api/entregas sin edición ni borrado — SPEC-ALE186-006', () => {
  it.each(['patch', 'delete'] as const)('%s /api/entregas/:id no existe', async (metodo) => {
    const res = await testApi()[metodo](`/api/entregas/${ID_ENTREGA}`).set(conSesion()).send({});

    expectApiError(res, { status: 404, codigo: 'NO_ENCONTRADO' });
    expect(crear).not.toHaveBeenCalled();
  });
});
