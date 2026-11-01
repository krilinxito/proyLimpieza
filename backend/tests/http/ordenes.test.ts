import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';
import { IDS, cuerpoDeOrden, ordenDePrueba } from '../helpers/ordenes.js';
import { conSesion } from '../helpers/usuarios.js';

// Como en clientes: se reemplazan las funciones que hablan con la base y se
// conservan las clases de error REALES, que el controller reconoce con
// `instanceof`.
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
vi.mock('../../src/models/ordenes.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/ordenes.model.js')>()),
  crear: vi.fn(),
  actualizar: vi.fn(),
  buscarPorId: vi.fn(),
}));
vi.mock('../../src/models/sucursales.model.js', () => ({ buscarPorId: vi.fn() }));
// La corrección del admin (SPEC-KRILINXI-071) decide y escribe en una transacción: eso se prueba contra la base real
// (tests/db/correccionOrden.db.test.ts). Acá solo importa qué le llega y qué responde el controller a cada resultado.
vi.mock('../../src/services/correccionOrden.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/correccionOrden.js')>()),
  corregirOrden: vi.fn(),
}));

const modelo = await import('../../src/models/ordenes.model.js');
const crear = vi.mocked(modelo.crear);
const actualizar = vi.mocked(modelo.actualizar);
const { BoletaOcupadaError, ClienteInexistenteError } = modelo;
const buscarSucursal = vi.mocked((await import('../../src/models/sucursales.model.js')).buscarPorId);
const corregirOrden = vi.mocked((await import('../../src/services/correccionOrden.js')).corregirOrden);

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
  corregirOrden.mockResolvedValue({ tipo: 'corregida', orden: ordenDePrueba() });
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

  // SPEC-KRILINXI-058
  it.each(['001003', 'B-1003', 'A001003'])('acepta la boleta %s', async (boleta) => {
    expect((await alta(cuerpoDeOrden({ numero_boleta: boleta }))).status).toBe(201);
    expect(loQueSeCreo()).toMatchObject({ numeroBoleta: boleta });
  });

  it('la boleta con letras y sin números dice qué hacer', async () => {
    const res = await alta(cuerpoDeOrden({ numero_boleta: 'abc' }));

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(res.body.error.mensaje).toContain('El número de boleta solo puede llevar letras, números y guion');
  });

  it('lo que deja el cliente puede venir en varias líneas, y se guarda con sus saltos (solo se recortan los bordes)', async () => {
    await alta(cuerpoDeOrden({ descripcion: '  2 camisas\n1 pantalón\n\n3 pañuelos  ' }));

    expect(loQueSeCreo()).toMatchObject({ descripcion: '2 camisas\n1 pantalón\n\n3 pañuelos' });
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
    await alta(cuerpoDeOrden({ estado: 'ENTREGADO' }));

    expect(loQueSeCreo()).not.toHaveProperty('estado');
  });

  it('responde 409 BOLETA_DUPLICADA cuando la boleta ya está usada en la sucursal', async () => {
    crear.mockRejectedValue(new BoletaOcupadaError('001234'));

    const res = await alta(cuerpoDeOrden());

    expectApiError(res, { status: 409, codigo: 'BOLETA_DUPLICADA' });
    expect(res.body.error.mensaje).toContain('Revisa el papel');
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
    // SPEC-KRILINXI-058: letras, números y guion, con al menos un número.
    ['con una boleta de solo letras', { numero_boleta: 'abc' }],
    ['con una boleta con espacios en el medio', { numero_boleta: '12 34' }],
    ['con una boleta con signos', { numero_boleta: '12/34' }],
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
    // Un ADMIN: desde SPEC-KRILINXI-068 el precio solo lo cambia él.
    const res = await edicion({
      numero_boleta: '009999',
      descripcion: 'Terno azul',
      precio_total: '60',
      fecha_estimada_salida: null,
      estado: 'ANULADO',
      // Nada de esto se puede cambiar por PATCH. La sucursal y la fecha de ingreso también se ignoraban; desde
      // SPEC-KRILINXI-071 las corrige el admin, sin un estado al lado (ver ese bloque).
      cliente_id: IDS.cliente,
      usuario_recepcion_id: IDS.cliente,
    }, ADMIN);

    expect(res.status).toBe(200);
    expect(actualizar.mock.calls[0]?.[1]).toEqual({
      numeroBoleta: '009999',
      descripcion: 'Terno azul',
      precioTotal: 6000,
      fechaEstimadaSalida: null,
      estado: 'ANULADO',
    });
  });

  it('pide al model que la orden esté en un estado desde el que se llega al pedido', async () => {
    await edicion({ estado: 'ANULADO' });

    expect(restricciones()?.estadosDeOrigen).toEqual(['RECIBIDO', 'ANULADO']);
  });

  it('no deja editar una orden cerrada, aunque el cambio no toque el estado', async () => {
    await edicion({ descripcion: 'Terno azul' });

    expect(restricciones()?.estadosDeOrigen).toEqual(['RECIBIDO']);
  });

  it('el reintento de una anulación pasa', async () => {
    actualizar.mockResolvedValue({ tipo: 'actualizada', orden: ordenDePrueba({ estado: 'ANULADO' }) });

    const res = await edicion({ estado: 'ANULADO' });

    expect(res.status).toBe(200);
    expect(restricciones()?.estadosDeOrigen).toContain('ANULADO');
  });

  it.each([
    ['tocar una orden ANULADA', ordenDePrueba({ estado: 'ANULADO' }), { descripcion: 'x' }],
    ['tocar una orden ENTREGADA', ordenDePrueba({ estado: 'ENTREGADO' }), { descripcion: 'x' }],
    ['tocar una orden REEMBOLSADA', ordenDePrueba({ estado: 'REEMBOLSADO' }), { descripcion: 'x' }],
    ['pedir ENTREGADO', ordenDePrueba({ estado: 'RECIBIDO' }), { estado: 'ENTREGADO' }],
    ['pedir REEMBOLSADO', ordenDePrueba({ estado: 'RECIBIDO' }), { estado: 'REEMBOLSADO' }],
  ])('responde 409 TRANSICION_INVALIDA al %s', async (_caso, actual, cuerpo) => {
    actualizar.mockResolvedValue({ tipo: 'estado-no-admitido', orden: actual });

    const res = await edicion(cuerpo);

    expectApiError(res, { status: 409, codigo: 'TRANSICION_INVALIDA' });
    // El mensaje es para el mostrador: estados en palabras, nunca el ENUM.
    expect(res.body.error.mensaje).not.toMatch(/RECIBIDO|REEMBOLSADO|ENTREGADO|ANULADO/);
  });

  it('responde 400 con un estado que no existe', async () => {
    const res = await edicion({ estado: 'PERDIDO' });

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  // SPEC-KRILINXI-067: los pasos intermedios se quitaron del sistema.
  it.each(['EN_PROCESO', 'LISTO'])('SPEC-KRILINXI-067: responde 400 al pedir %s, que ya no existe', async (estado) => {
    const res = await edicion({ estado });

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('SPEC-KRILINXI-067: desde RECIBIDO solo se pide ANULADO, y las cerradas no se editan', async () => {
    await edicion({ estado: 'ANULADO' });
    expect(restricciones()?.estadosDeOrigen).toEqual(['RECIBIDO', 'ANULADO']);

    await edicion({ descripcion: 'Terno azul' });
    expect(restricciones()?.estadosDeOrigen).toEqual(['RECIBIDO']);
  });

  it.each([
    ['la boleta en blanco', { numero_boleta: ' ' }],
    ['la descripción en blanco', { descripcion: '' }],
    ['una fecha estimada inválida', { fecha_estimada_salida: 'mañana' }],
  ])('responde 400 con %s', async (_caso, cuerpo) => {
    const res = await edicion(cuerpo);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });

  it('responde 400 con un precio negativo (el que puede cambiarlo es el ADMIN, SPEC-KRILINXI-068)', async () => {
    const res = await edicion({ precio_total: -1 }, ADMIN);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
  });

  it('responde 409 BOLETA_DUPLICADA cuando la boleta nueva ya la usa otra orden', async () => {
    actualizar.mockRejectedValue(new BoletaOcupadaError('009999'));

    const res = await edicion({ numero_boleta: '009999' });

    expectApiError(res, { status: 409, codigo: 'BOLETA_DUPLICADA' });
  });

  it('un EMPLEADO solo puede tocar las órdenes de su sucursal', async () => {
    await edicion({ estado: 'ANULADO' });

    expect(restricciones()?.sucursalId).toBe(IDS.sucursal);
  });

  it('un ADMIN puede tocar las de cualquier sucursal', async () => {
    await edicion({ estado: 'ANULADO' }, ADMIN);

    expect(restricciones()?.sucursalId).toBeNull();
  });

  it('responde 404 cuando la orden no existe o es de otra sucursal', async () => {
    actualizar.mockResolvedValue({ tipo: 'no-encontrada' });

    const res = await edicion({ estado: 'ANULADO' });

    expectApiError(res, { status: 404, codigo: 'NO_ENCONTRADO' });
  });

  it('responde 400 cuando el id de la ruta no es un UUID', async () => {
    const res = await edicion({ estado: 'ANULADO' }, conSesion(), '001234');

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('responde 401 sin token', async () => {
    const res = await testApi().patch(`/api/ordenes/${IDS.orden}`).send({ estado: 'ANULADO' });

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
  });
});

describe('POST /api/ordenes: sucursal cerrada y fecha futura — SPEC-ALE186-014', () => {
  it('responde 409 SUCURSAL_CERRADA, con qué hacer, cuando la sucursal fue dada de baja', async () => {
    crear.mockRejectedValue(new modelo.SucursalCerradaError(IDS.sucursal));

    const res = await alta(cuerpoDeOrden());

    expectApiError(res, { status: 409, codigo: 'SUCURSAL_CERRADA' });
    expect(res.body.error.mensaje).toMatch(/Avísale al encargado/);
  });

  it('responde 400 FECHA_FUTURA, pidiendo revisar la hora de la tablet', async () => {
    crear.mockRejectedValue(new modelo.FechaFuturaError('2099-01-01T00:00:00Z'));

    const res = await alta(cuerpoDeOrden({ fecha_entrada: '2099-01-01T00:00:00Z' }));

    expectApiError(res, { status: 400, codigo: 'FECHA_FUTURA' });
    expect(res.body.error.mensaje).toMatch(/hora de la tablet/);
  });
});

describe('PATCH /api/ordenes/:id: el precio sale de los renglones — SPEC-KRILINXI-068', () => {
  it('un EMPLEADO no cambia el precio_total: 403, sin llegar al model', async () => {
    const res = await edicion({ precio_total: '60' });

    expectApiError(res, { status: 403, codigo: 'SIN_PERMISO' });
    expect(res.body.error.mensaje).toMatch(/administrador/);
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('tampoco junto con otros campos: el PATCH entero se rechaza, no se aplica a medias', async () => {
    const res = await edicion({ descripcion: 'Terno azul', precio_total: '45.50' });

    expectApiError(res, { status: 403, codigo: 'SIN_PERMISO' });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('el EMPLEADO sigue pudiendo anular y cambiar la fecha estimada', async () => {
    const res = await edicion({ estado: 'ANULADO', fecha_estimada_salida: '2026-11-05' });

    expect(res.status).toBe(200);
    expect(actualizar).toHaveBeenCalledTimes(1);
  });

  it('el ADMIN sí cambia el precio_total (desde SPEC-KRILINXI-071, por la corrección)', async () => {
    const res = await edicion({ precio_total: '60' }, ADMIN);

    expect(res.status).toBe(200);
    expect(corregirOrden.mock.calls[0]?.[1]).toEqual({ precioTotal: 6000 });
    expect(actualizar).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/ordenes/:id: el admin corrige una boleta — SPEC-KRILINXI-071', () => {
  const PRENDA = '66666666-6666-6666-6666-666666666666';
  const OTRA_PRENDA = '77777777-7777-7777-7777-777777777777';

  /** Lo que recibió el servicio en la última corrección. */
  function loQueSeCorrigio() {
    return corregirOrden.mock.calls.at(-1)?.[1];
  }

  it('el ADMIN corrige cualquier campo, en cualquier estado: todo va al servicio, y responde la orden', async () => {
    const res = await edicion(
      {
        numero_boleta: 'B-0099',
        descripcion: '1 Saco',
        fecha_entrada: '2026-10-20T09:30:00-04:00',
        fecha_estimada_salida: '2026-10-25',
        sucursal_id: IDS.otraSucursal,
      },
      ADMIN,
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ numeroBoleta: '001234' });
    expect(loQueSeCorrigio()).toEqual({
      numeroBoleta: 'B-0099',
      descripcion: '1 Saco',
      fechaEntrada: '2026-10-20T09:30:00-04:00',
      fechaEstimadaSalida: '2026-10-25',
      sucursalId: IDS.otraSucursal,
    });
    // No pasa por la tabla de transiciones: la corrección no depende del estado.
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('quien corrige es el de la sesión', async () => {
    await edicion({ descripcion: '1 Saco' }, conSesion({ rol: 'ADMIN', sucursalId: null, id: IDS.otraSucursal }));

    expect(corregirOrden.mock.calls[0]?.[2]).toBe(IDS.otraSucursal);
  });

  it('las prendas llegan enteras, en enteros (centésimas y centavos)', async () => {
    await edicion(
      {
        renglones: [
          { id: PRENDA, descripcion: ' Camisa ', cantidad: '2', precio_unitario: '10.50' },
          { id: OTRA_PRENDA, descripcion: 'Edredón', cantidad: '1', precio_unitario: '40' },
        ],
      },
      ADMIN,
    );

    expect(loQueSeCorrigio()).toEqual({
      renglones: [
        { id: PRENDA, descripcion: 'Camisa', cantidad: 200, precioUnitario: 1050 },
        { id: OTRA_PRENDA, descripcion: 'Edredón', cantidad: 100, precioUnitario: 4000 },
      ],
    });
  });

  it('con prendas, un total escrito que no es su suma se rechaza con 400 y dice cuánto suman', async () => {
    const res = await edicion(
      { precio_total: '50', renglones: [{ id: PRENDA, descripcion: 'Camisa', cantidad: '2', precio_unitario: '10' }] },
      ADMIN,
    );

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(res.body.error.mensaje).toContain('Bs 20.00');
    expect(corregirOrden).not.toHaveBeenCalled();
  });

  it.each([
    ['no es una lista', { renglones: 'Camisa' }],
    ['una prenda sin id', { renglones: [{ descripcion: 'Camisa', cantidad: '1', precio_unitario: '10' }] }],
    [
      'dos prendas con el mismo id',
      {
        renglones: [
          { id: PRENDA, descripcion: 'Camisa', cantidad: '1', precio_unitario: '10' },
          { id: PRENDA, descripcion: 'Saco', cantidad: '1', precio_unitario: '10' },
        ],
      },
    ],
    ['una cantidad en cero', { renglones: [{ id: PRENDA, descripcion: 'Camisa', cantidad: '0', precio_unitario: '10' }] }],
    ['un precio negativo', { renglones: [{ id: PRENDA, descripcion: 'Camisa', cantidad: '1', precio_unitario: '-1' }] }],
    ['una prenda sin descripción', { renglones: [{ id: PRENDA, descripcion: ' ', cantidad: '1', precio_unitario: '1' }] }],
    ['una sucursal que no es un UUID', { sucursal_id: 'Centro' }],
    ['una fecha de ingreso sin zona', { fecha_entrada: '2026-10-20 09:30' }],
    ['una fecha de ingreso vacía', { fecha_entrada: null }],
  ])('responde 400 sin llegar al servicio cuando llega %s', async (_caso, cuerpo) => {
    const res = await edicion(cuerpo, ADMIN);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(corregirOrden).not.toHaveBeenCalled();
  });

  it('no deja pasar más de 100 prendas', async () => {
    const renglones = Array.from({ length: 101 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      descripcion: 'Camisa',
      cantidad: '1',
      precio_unitario: '1',
    }));

    expectApiError(await edicion({ renglones }, ADMIN), { status: 400, codigo: 'VALIDACION' });
  });

  it.each([
    ['sucursal_id', { sucursal_id: IDS.otraSucursal }],
    ['fecha_entrada', { fecha_entrada: '2026-10-20T09:30:00-04:00' }],
    ['renglones', { renglones: [] }],
  ])('un EMPLEADO no manda %s: 403, sin tocar nada', async (_campo, cuerpo) => {
    const res = await edicion({ descripcion: '1 Saco', ...cuerpo });

    expectApiError(res, { status: 403, codigo: 'SIN_PERMISO' });
    expect(corregirOrden).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('un EMPLEADO sigue sin poder editar una boleta cerrada: el camino de siempre, con su 409', async () => {
    actualizar.mockResolvedValue({ tipo: 'estado-no-admitido', orden: ordenDePrueba({ estado: 'ENTREGADO' }) });

    const res = await edicion({ descripcion: '1 Saco' });

    expectApiError(res, { status: 409, codigo: 'TRANSICION_INVALIDA' });
    expect(corregirOrden).not.toHaveBeenCalled();
  });

  it('el ADMIN que anula sigue la tabla de transiciones de siempre', async () => {
    await edicion({ estado: 'ANULADO' }, ADMIN);

    expect(actualizar).toHaveBeenCalledTimes(1);
    expect(corregirOrden).not.toHaveBeenCalled();
  });

  it('el estado no se mezcla con lo que solo el admin corrige', async () => {
    const res = await edicion({ estado: 'ANULADO', sucursal_id: IDS.otraSucursal }, ADMIN);

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect(actualizar).not.toHaveBeenCalled();
    expect(corregirOrden).not.toHaveBeenCalled();
  });

  it.each([
    [{ tipo: 'no-encontrada' }, 404, 'NO_ENCONTRADO', 'Vuelve al historial'],
    [{ tipo: 'sucursal-no-existe' }, 400, 'VALIDACION', 'no existe'],
    [{ tipo: 'sucursal-cerrada' }, 409, 'SUCURSAL_CERRADA', 'Elige otra'],
    [{ tipo: 'fecha-futura' }, 400, 'FECHA_FUTURA', 'en el futuro'],
    [
      { tipo: 'total-menor-que-cobrado', orden: ordenDePrueba(), pagado: '30.00' },
      409,
      'TOTAL_MENOR_QUE_COBRADO',
      'Ya se cobraron Bs 30.00 de la boleta 001234',
    ],
    [
      { tipo: 'total-distinto-de-renglones', orden: ordenDePrueba(), suma: '20.00' },
      409,
      'TOTAL_DISTINTO_DE_RENGLONES',
      'suman Bs 20.00',
    ],
    [
      { tipo: 'renglon-ajeno', orden: ordenDePrueba(), renglonId: PRENDA, esCargo: true },
      400,
      'VALIDACION',
      'Los cargos que se sumaron al entregar no se cambian aquí',
    ],
    [
      { tipo: 'renglon-ajeno', orden: ordenDePrueba(), renglonId: PRENDA, esCargo: false },
      400,
      'VALIDACION',
      'no es de esta boleta',
    ],
  ] as const)('el resultado %o responde %i %s, diciendo qué hacer', async (resultado, status, codigo, texto) => {
    corregirOrden.mockResolvedValue(resultado);

    const res = await edicion({ descripcion: '1 Saco' }, ADMIN);

    expectApiError(res, { status, codigo });
    expect(res.body.error.mensaje).toContain(texto);
  });

  it('una boleta repetida responde 409 BOLETA_DUPLICADA, y si se movía, habla de la sucursal elegida', async () => {
    corregirOrden.mockRejectedValue(new BoletaOcupadaError('001234'));

    const enLaMisma = await edicion({ numero_boleta: '001234' }, ADMIN);
    const alMover = await edicion({ sucursal_id: IDS.otraSucursal }, ADMIN);

    expectApiError(enLaMisma, { status: 409, codigo: 'BOLETA_DUPLICADA' });
    expect(enLaMisma.body.error.mensaje).toContain('en esta sucursal');
    expectApiError(alMover, { status: 409, codigo: 'BOLETA_DUPLICADA' });
    expect(alMover.body.error.mensaje).toContain('En la sucursal elegida ya hay una boleta con ese número');
  });
});
