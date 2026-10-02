import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';
import { IDS, cuerpoDeOrden, ordenDePrueba } from '../helpers/ordenes.js';
import { conSesion } from '../helpers/usuarios.js';

// Como en clientes: se reemplazan las funciones que hablan con la base y se
// conservan las clases de error REALES, que el controller reconoce con
// `instanceof`.
vi.mock('../../src/models/ordenes.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/ordenes.model.js')>()),
  crear: vi.fn(),
  actualizar: vi.fn(),
  buscarPorId: vi.fn(),
}));
vi.mock('../../src/models/sucursales.model.js', () => ({ buscarPorId: vi.fn() }));

const modelo = await import('../../src/models/ordenes.model.js');
const crear = vi.mocked(modelo.crear);
const actualizar = vi.mocked(modelo.actualizar);
const { BoletaOcupadaError, ClienteInexistenteError } = modelo;
const buscarSucursal = vi.mocked((await import('../../src/models/sucursales.model.js')).buscarPorId);

const ADMIN = conSesion({ rol: 'ADMIN', sucursalId: null });

function alta(cuerpo: Record<string, unknown>, sesion = conSesion()) {
  return testApi().post('/api/ordenes').set(sesion).send(cuerpo);
}

function edicion(cuerpo: Record<string, unknown>, sesion = conSesion(), id: string = IDS.orden) {
  return testApi().patch(`/api/ordenes/${id}`).set(sesion).send(cuerpo);
}

/** Lo que recibió el model en la última llamada a `crear`. */
function loQueSeCreo() {
  return crear.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  crear.mockResolvedValue({ orden: ordenDePrueba(), creada: true });
  actualizar.mockResolvedValue({ tipo: 'actualizada', orden: ordenDePrueba() });
  buscarSucursal.mockResolvedValue({
    id: IDS.otraSucursal,
    nombre: 'Sucursal Centro',
    direccion: null,
    telefono: null,
    activa: true,
  });
});

describe('POST /api/ordenes — SPEC-ALE186-004', () => {
  it('crea la orden con el id del dispositivo y responde 201', async () => {
    const cuerpo = cuerpoDeOrden({ fecha_estimada_salida: '2026-10-03' });

    const res = await alta(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ numeroBoleta: '001234', estado: 'RECIBIDO' });
    expect(loQueSeCreo()).toMatchObject({
      id: cuerpo.id,
      numeroBoleta: '001234',
      clienteId: IDS.cliente,
      descripcion: '2 camisas, 1 terno',
      precioTotal: 4550,
      fechaEstimadaSalida: '2026-10-03',
    });
  });

  it('en un reintento responde 200 con la que ya existía', async () => {
    crear.mockResolvedValue({ orden: ordenDePrueba(), creada: false });

    const res = await alta(cuerpoDeOrden());

    expect(res.status).toBe(200);
  });

  it.each([
    ['falta', { id: undefined }],
    ['no es un UUID', { id: '001234' }],
  ])('responde 400 cuando el id %s', async (_caso, cambio) => {
    const res = await alta(cuerpoDeOrden(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('toma la sucursal y quien recibe de la sesión del EMPLEADO, no del cuerpo', async () => {
    await alta(
      cuerpoDeOrden({ sucursal_id: IDS.otraSucursal, usuario_recepcion_id: IDS.cliente }),
    );

    expect(loQueSeCreo()).toMatchObject({ sucursalId: IDS.sucursal, usuarioRecepcionId: IDS.usuario });
    expect(buscarSucursal).not.toHaveBeenCalled();
  });

  it('ignora un estado que venga en el cuerpo', async () => {
    await alta(cuerpoDeOrden({ estado: 'LISTO' }));

    expect(loQueSeCreo()).not.toHaveProperty('estado');
  });

  it('responde 409 BOLETA_DUPLICADA cuando la boleta ya está usada en la sucursal', async () => {
    crear.mockRejectedValue(new BoletaOcupadaError('001234'));

    const res = await alta(cuerpoDeOrden());

    expectApiError(res, { status: 409, codigo: 'BOLETA_DUPLICADA' });
    expect(res.body.error.mensaje).toContain('Revisá el papel');
  });

  it('el mismo número en otra sucursal no choca: la unicidad es por sucursal', async () => {
    // El controller no busca la boleta por su cuenta: deja que decida la
    // restricción UNIQUE (sucursal_id, numero_boleta) del schema. Si hubiera
    // una comprobación global aquí, este caso daría 409.
    const res = await alta(cuerpoDeOrden(), conSesion({ sucursalId: IDS.otraSucursal }));

    expect(res.status).toBe(201);
    expect(loQueSeCreo()).toMatchObject({ sucursalId: IDS.otraSucursal, numeroBoleta: '001234' });
  });

  it('responde 400 cuando el cliente no existe', async () => {
    crear.mockRejectedValue(new ClienteInexistenteError(IDS.cliente));

    const res = await alta(cuerpoDeOrden());

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });

  it.each([
    ['sin cliente', { cliente_id: undefined }],
    ['con un cliente que no es un UUID', { cliente_id: 'Ana' }],
    ['sin boleta', { numero_boleta: undefined }],
    ['con la boleta en blanco', { numero_boleta: '   ' }],
    ['con una boleta más larga que la columna', { numero_boleta: '1'.repeat(31) }],
    ['sin descripción', { descripcion: undefined }],
    ['con la descripción en blanco', { descripcion: '  ' }],
  ])('responde 400 %s', async (_caso, cambio) => {
    const res = await alta(cuerpoDeOrden(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(crear).not.toHaveBeenCalled();
  });

  it.each([
    ['falta', undefined],
    ['es negativo', '-10'],
    ['no es un número', 'cuarenta'],
    ['tiene tres decimales', '45.505'],
    ['es un float contaminado', 0.1 + 0.2],
    ['no entra en NUMERIC(10,2)', '100000000.00'],
  ])('responde 400 cuando el precio %s', async (_caso, precio) => {
    const res = await alta(cuerpoDeOrden({ precio_total: precio }));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });

  it('acepta un precio cero y un precio numérico', async () => {
    await alta(cuerpoDeOrden({ precio_total: 0 }));
    expect(loQueSeCreo()).toMatchObject({ precioTotal: 0 });

    await alta(cuerpoDeOrden({ precio_total: 45.5 }));
    expect(loQueSeCreo()).toMatchObject({ precioTotal: 4550 });
  });

  it('usa la fecha de entrada del dispositivo cuando viene, y ninguna cuando no', async () => {
    await alta(cuerpoDeOrden({ fecha_entrada: '2026-09-29T18:30:00.000Z' }));
    expect(loQueSeCreo()).toMatchObject({ fechaEntrada: '2026-09-29T18:30:00.000Z' });

    await alta(cuerpoDeOrden());
    expect(loQueSeCreo()).toMatchObject({ fechaEntrada: null });
  });

  it.each([
    ['la fecha de entrada no tiene zona', { fecha_entrada: '2026-09-29T18:30:00' }],
    ['la fecha de entrada no es una fecha', { fecha_entrada: 'ayer' }],
    ['la fecha estimada no existe', { fecha_estimada_salida: '2026-02-30' }],
  ])('responde 400 cuando %s', async (_caso, cambio) => {
    const res = await alta(cuerpoDeOrden(cambio));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });

  it('un ADMIN registra en la sucursal que indica el cuerpo', async () => {
    const res = await alta(cuerpoDeOrden({ sucursal_id: IDS.otraSucursal }), ADMIN);

    expect(res.status).toBe(201);
    expect(buscarSucursal).toHaveBeenCalledWith(IDS.otraSucursal);
    expect(loQueSeCreo()).toMatchObject({ sucursalId: IDS.otraSucursal, usuarioRecepcionId: IDS.usuario });
  });

  it.each([
    ['no la indica', undefined, false],
    ['indica algo que no es un UUID', 'Centro', false],
    ['indica una que no existe', IDS.otraSucursal, true],
  ])('responde 400 cuando un ADMIN %s', async (_caso, sucursal, consultaLaBase) => {
    buscarSucursal.mockResolvedValue(null);

    const res = await alta(cuerpoDeOrden({ sucursal_id: sucursal }), ADMIN);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(buscarSucursal).toHaveBeenCalledTimes(consultaLaBase ? 1 : 0);
    expect(crear).not.toHaveBeenCalled();
  });

  it('responde 400 cuando un ADMIN indica una sucursal cerrada', async () => {
    buscarSucursal.mockResolvedValue({
      id: IDS.otraSucursal,
      nombre: 'Sucursal Norte',
      direccion: null,
      telefono: null,
      activa: false,
    });

    const res = await alta(cuerpoDeOrden({ sucursal_id: IDS.otraSucursal }), ADMIN);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });

  it('responde 401 sin token', async () => {
    const res = await testApi().post('/api/ordenes').send(cuerpoDeOrden());

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
  });
});

describe('PATCH /api/ordenes/:id — SPEC-ALE186-004', () => {
  /** Las restricciones con las que el controller llamó al model. */
  function restricciones() {
    return actualizar.mock.calls.at(-1)?.[2];
  }

  it('aplica solo los cinco campos editables y responde 200 con la orden', async () => {
    const res = await edicion({
      numero_boleta: '009999',
      descripcion: 'Terno azul',
      precio_total: '60',
      fecha_estimada_salida: null,
      estado: 'EN_PROCESO',
      // Nada de esto se puede cambiar por PATCH:
      cliente_id: IDS.cliente,
      sucursal_id: IDS.otraSucursal,
      usuario_recepcion_id: IDS.cliente,
      fecha_entrada: '2020-01-01T00:00:00Z',
    });

    expect(res.status).toBe(200);
    expect(actualizar.mock.calls[0]?.[1]).toEqual({
      numeroBoleta: '009999',
      descripcion: 'Terno azul',
      precioTotal: 6000,
      fechaEstimadaSalida: null,
      estado: 'EN_PROCESO',
    });
  });

  it('pide al model que la orden esté en un estado desde el que se llega al pedido', async () => {
    await edicion({ estado: 'LISTO' });

    expect(restricciones()?.estadosDeOrigen).toEqual(['RECIBIDO', 'EN_PROCESO', 'LISTO']);
  });

  it('no deja editar una orden cerrada, aunque el cambio no toque el estado', async () => {
    await edicion({ descripcion: 'Terno azul' });

    expect(restricciones()?.estadosDeOrigen).toEqual(['RECIBIDO', 'EN_PROCESO', 'LISTO']);
  });

  it('el reintento de una anulación pasa', async () => {
    actualizar.mockResolvedValue({ tipo: 'actualizada', orden: ordenDePrueba({ estado: 'ANULADO' }) });

    const res = await edicion({ estado: 'ANULADO' });

    expect(res.status).toBe(200);
    expect(restricciones()?.estadosDeOrigen).toContain('ANULADO');
  });

  it.each([
    ['volver hacia atrás', ordenDePrueba({ estado: 'LISTO' }), { estado: 'RECIBIDO' }],
    ['tocar una orden ANULADA', ordenDePrueba({ estado: 'ANULADO' }), { estado: 'LISTO' }],
    ['tocar una orden ENTREGADA', ordenDePrueba({ estado: 'ENTREGADO' }), { descripcion: 'x' }],
    ['pedir ENTREGADO', ordenDePrueba({ estado: 'LISTO' }), { estado: 'ENTREGADO' }],
  ])('responde 409 TRANSICION_INVALIDA al %s', async (_caso, actual, cuerpo) => {
    actualizar.mockResolvedValue({ tipo: 'estado-no-admitido', orden: actual });

    const res = await edicion(cuerpo);

    expectApiError(res, { status: 409, codigo: 'TRANSICION_INVALIDA' });
    // El mensaje es para el mostrador: estados en palabras, nunca el ENUM.
    expect(res.body.error.mensaje).not.toMatch(/RECIBIDO|EN_PROCESO|LISTO|ENTREGADO|ANULADO/);
  });

  it('responde 400 con un estado que no existe', async () => {
    const res = await edicion({ estado: 'PERDIDO' });

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it.each([
    ['la boleta en blanco', { numero_boleta: ' ' }],
    ['la descripción en blanco', { descripcion: '' }],
    ['un precio negativo', { precio_total: -1 }],
    ['una fecha estimada inválida', { fecha_estimada_salida: 'mañana' }],
  ])('responde 400 con %s', async (_caso, cuerpo) => {
    const res = await edicion(cuerpo);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });

  it('responde 409 BOLETA_DUPLICADA cuando la boleta nueva ya la usa otra orden', async () => {
    actualizar.mockRejectedValue(new BoletaOcupadaError('009999'));

    const res = await edicion({ numero_boleta: '009999' });

    expectApiError(res, { status: 409, codigo: 'BOLETA_DUPLICADA' });
  });

  it('un EMPLEADO solo puede tocar las órdenes de su sucursal', async () => {
    await edicion({ estado: 'LISTO' });

    expect(restricciones()?.sucursalId).toBe(IDS.sucursal);
  });

  it('un ADMIN puede tocar las de cualquier sucursal', async () => {
    await edicion({ estado: 'LISTO' }, ADMIN);

    expect(restricciones()?.sucursalId).toBeNull();
  });

  it('responde 404 cuando la orden no existe o es de otra sucursal', async () => {
    actualizar.mockResolvedValue({ tipo: 'no-encontrada' });

    const res = await edicion({ estado: 'LISTO' });

    expectApiError(res, { status: 404, codigo: 'NO_ENCONTRADO' });
  });

  it('responde 400 cuando el id de la ruta no es un UUID', async () => {
    const res = await edicion({ estado: 'LISTO' }, conSesion(), '001234');

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('responde 401 sin token', async () => {
    const res = await testApi().patch(`/api/ordenes/${IDS.orden}`).send({ estado: 'LISTO' });

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
  });
});
