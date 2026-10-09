import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';
import { IDS, ordenDePrueba } from '../helpers/ordenes.js';
import { ID_PAGO, cuerpoDePago, pagoDePrueba } from '../helpers/pagos.js';
import { conSesion } from '../helpers/usuarios.js';

// Se reemplaza la función del model que habla con la base. Lo que se prueba acá
// es el controller: qué valida, qué le pasa al model y cómo traduce cada
// resultado a HTTP. Que el SQL haga lo que promete es cosa del test del model.
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
vi.mock('../../src/models/pagos.model.js', () => ({ crear: vi.fn() }));

const crear = vi.mocked((await import('../../src/models/pagos.model.js')).crear);

const ADMIN = conSesion({ rol: 'ADMIN', sucursalId: null });

function cobro(cuerpo: Record<string, unknown>, sesion = conSesion()) {
  return testApi().post('/api/pagos').set(sesion).send(cuerpo);
}

/** Lo que recibió el model en la última llamada: los datos y las restricciones. */
function loQueSeCreo() {
  return crear.mock.calls.at(-1)?.[0];
}
function restricciones() {
  return crear.mock.calls.at(-1)?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  crear.mockResolvedValue({ tipo: 'creado', pago: pagoDePrueba() });
});

describe('POST /api/pagos — SPEC-ALE186-005', () => {
  it('registra el pago con el id del dispositivo y responde 201 con sus datos', async () => {
    const cuerpo = cuerpoDePago({ fecha_pago: '2026-10-02T14:15:00Z' });

    const res = await cobro(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: ID_PAGO, ordenId: IDS.orden, monto: '20.00', tipo: 'ADELANTO' });
    expect(loQueSeCreo()).toEqual({
      id: cuerpo.id,
      ordenId: IDS.orden,
      monto: 2000,
      tipo: 'ADELANTO',
      metodo: 'EFECTIVO',
      fechaPago: '2026-10-02T14:15:00Z',
      usuarioId: IDS.usuario,
    });
  });

  it('un ADMIN también cobra, y sin límite de sucursal', async () => {
    const res = await cobro(cuerpoDePago(), ADMIN);

    expect(res.status).toBe(201);
    expect(restricciones()).toEqual({ sucursalId: null });
  });

  it('un EMPLEADO solo cobra órdenes de su sucursal', async () => {
    await cobro(cuerpoDePago());

    expect(restricciones()).toEqual({ sucursalId: IDS.sucursal });
  });

  it('en un reintento responde 200 con el pago que ya existía', async () => {
    crear.mockResolvedValue({ tipo: 'existente', pago: pagoDePrueba() });

    const res = await cobro(cuerpoDePago());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ID_PAGO });
  });

  it.each([
    ['falta', { id: undefined }],
    ['no es un UUID', { id: 'pago-1' }],
  ])('responde 400 cuando el id %s', async (_caso, cambio) => {
    const res = await cobro(cuerpoDePago(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('toma quien cobra de la sesión, nunca del cuerpo', async () => {
    await cobro(cuerpoDePago({ usuario_id: IDS.cliente }));

    expect(loQueSeCreo()).toMatchObject({ usuarioId: IDS.usuario });
  });

  it.each([
    ['un EMPLEADO', conSesion()],
    ['un ADMIN', ADMIN],
  ])('ignora el sucursal_id del cuerpo cuando cobra %s: sale de la orden', async (_caso, sesion) => {
    await cobro(cuerpoDePago({ sucursal_id: IDS.otraSucursal }), sesion);

    // Ni en los datos ni en las restricciones aparece la sucursal del cuerpo.
    expect(loQueSeCreo()).not.toHaveProperty('sucursalId');
    expect(restricciones()?.sucursalId).not.toBe(IDS.otraSucursal);
  });

  it.each([
    ['falta', { orden_id: undefined }],
    ['no es un UUID', { orden_id: '001234' }],
  ])('responde 400 cuando la orden %s', async (_caso, cambio) => {
    const res = await cobro(cuerpoDePago(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('responde 400 cuando la orden no existe o es de otra sucursal', async () => {
    // El model responde igual en los dos casos (ver su test): para un EMPLEADO,
    // una orden ajena no existe.
    crear.mockResolvedValue({ tipo: 'orden-no-encontrada' });

    const res = await cobro(cuerpoDePago());

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });

  it('manda el monto al model en centavos enteros', async () => {
    await cobro(cuerpoDePago({ monto: 12.5 }));

    expect(loQueSeCreo()).toMatchObject({ monto: 1250 });
  });

  it.each([
    ['sin monto', { monto: undefined }],
    ['con un monto que no es un número', { monto: 'veinte' }],
    ['con más de dos decimales', { monto: '20.505' }],
    ['con un float contaminado', { monto: 0.1 + 0.2 }],
    ['con monto cero', { monto: '0' }],
    ['con monto cero escrito con decimales', { monto: '0.00' }],
    ['con un monto negativo', { monto: '-5' }],
    ['con un monto que no entra en la columna', { monto: '100000000.00' }],
  ])('responde 400 %s', async (_caso, cambio) => {
    const res = await cobro(cuerpoDePago(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it.each([
    ['sin tipo', { tipo: undefined }],
    ['con un tipo que no existe', { tipo: 'PROPINA' }],
    ['con el tipo en minúsculas', { tipo: 'adelanto' }],
    ['sin método', { metodo: undefined }],
    ['con un método que no existe', { metodo: 'CHEQUE' }],
  ])('responde 400 %s', async (_caso, cambio) => {
    const res = await cobro(cuerpoDePago(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it.each(['ADELANTO', 'PAGO_FINAL'])('acepta el tipo %s', async (tipo) => {
    const res = await cobro(cuerpoDePago({ tipo }));

    expect(res.status).toBe(201);
  });

  it.each(['EFECTIVO', 'QR', 'TARJETA', 'TRANSFERENCIA'])('acepta el método %s', async (metodo) => {
    const res = await cobro(cuerpoDePago({ metodo }));

    expect(res.status).toBe(201);
  });

  it('sin fecha_pago, deja que la ponga el servidor', async () => {
    await cobro(cuerpoDePago());

    expect(loQueSeCreo()).toMatchObject({ fechaPago: null });
  });

  it.each([
    ['no es una fecha', 'ayer'],
    ['no trae zona horaria', '2026-10-02T14:15:00'],
    ['es solo un día', '2026-10-02'],
  ])('responde 400 cuando fecha_pago %s', async (_caso, fecha) => {
    const res = await cobro(cuerpoDePago({ fecha_pago: fecha }));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('responde 409 ORDEN_ANULADA, nombrando la boleta y diciendo qué hacer', async () => {
    crear.mockResolvedValue({ tipo: 'orden-anulada', orden: ordenDePrueba({ estado: 'ANULADO' }) });

    const res = await cobro(cuerpoDePago());

    expectApiError(res, { status: 409, codigo: 'ORDEN_ANULADA' });
    expect(res.body.error.mensaje).toContain('001234');
    expect(res.body.error.mensaje).toContain('avisale al administrador');
  });

  it('acepta un PAGO_FINAL sin mirar si hay entrega, ni cuánto se pagó antes', async () => {
    // El controller no consulta entregas ni suma pagos: si lo hiciera, este
    // pago (que deja el saldo negativo) no llegaría al model.
    const res = await cobro(cuerpoDePago({ tipo: 'PAGO_FINAL', monto: '9999.99' }));

    expect(res.status).toBe(201);
    expect(crear).toHaveBeenCalledTimes(1);
  });

  it('responde 403 a un EMPLEADO sin sucursal en vez de dejarlo cobrar en todas', async () => {
    const res = await cobro(cuerpoDePago(), conSesion({ sucursalId: null }));

    expectApiError(res, { status: 403, codigo: 'SIN_PERMISO' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('responde 401 NO_AUTENTICADO sin un token válido', async () => {
    const res = await testApi().post('/api/pagos').send(cuerpoDePago());

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
    expect(crear).not.toHaveBeenCalled();
  });
});

describe('/api/pagos sin edición ni borrado — SPEC-ALE186-005', () => {
  it.each(['patch', 'delete'] as const)('%s /api/pagos/:id no existe', async (metodo) => {
    const res = await testApi()[metodo](`/api/pagos/${ID_PAGO}`).set(conSesion()).send({ monto: '1' });

    expectApiError(res, { status: 404, codigo: 'NO_ENCONTRADO' });
    expect(crear).not.toHaveBeenCalled();
  });
});
