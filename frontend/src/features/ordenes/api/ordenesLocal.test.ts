import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { HORA_DEL_SERVIDOR_ISO, tabletConRelojCorrido } from '../../../test/reloj';
import type { DatosRopa, QuienRegistra } from '../types';
import { FALTA_NOMBRE, FALTA_TELEFONO } from '../../clientes/api/clientesLocal';
import { MENSAJES_RENGLON, type RenglonEscrito } from '../renglones';
import { MENSAJES, registrarRopa, validarBoleta } from './ordenesLocal';

const ROSA = { id: randomUUID(), nombre: 'Rosa Quispe', telefono: '70123456', carnet: null };
const QUIEN: QuienRegistra = { usuarioId: randomUUID(), sucursalId: randomUUID() };
const OTRA_SUCURSAL = randomUUID();

/** Un renglón de la boleta (SPEC-KRILINXI-068): una camisa de Bs 10, salvo lo que el test cambie. */
function prenda(campos: Partial<RenglonEscrito> = {}): RenglonEscrito {
  return { clave: randomUUID(), descripcion: 'Camisa', cantidad: '1', precioUnitario: '10', ...campos };
}

/** Una boleta de un solo renglón con ese precio: para los tests a los que solo les importa el total. */
function conPrecio(precioUnitario: string, clave: string = randomUUID()): Partial<DatosRopa> {
  return { renglones: [prenda({ clave, precioUnitario })] };
}

/** Una ropa válida (2 pantalones a Bs 15 y 1 saco de Bs 20: Bs 50); cada test cambia solo lo que le importa. */
function datosRopa(cambios: Partial<DatosRopa> = {}): DatosRopa {
  return {
    cliente: { tipo: 'existente', cliente: ROSA },
    numeroBoleta: '001234',
    renglones: [
      prenda({ descripcion: 'pantalones', cantidad: '2', precioUnitario: '15' }),
      prenda({ descripcion: 'saco', cantidad: '1', precioUnitario: '20' }),
    ],
    fechaEstimada: '',
    adelanto: '',
    metodoAdelanto: null,
    ...cambios,
  };
}

/** La cola de subida como [operación, tabla, datos]: lo que le va a llegar a uploadData. */
async function cola(db: Awaited<ReturnType<typeof baseLocalDePrueba>>['db']) {
  const lote = await db.getCrudBatch(100);
  return (lote?.crud ?? []).map((c) => [c.op, c.table, c.opData]);
}

describe('Registrar ropa en la base local — SPEC-KRILINXI-006', () => {
  it('guarda la orden RECIBIDO, con la sucursal y el usuario de la sesión, y la deja en la cola', async () => {
    const { control, db } = await baseLocalDePrueba();
    const resultado = await registrarRopa(
      control.base,
      QUIEN,
      datosRopa({ numeroBoleta: ' 001234 ', fechaEstimada: '2026-10-10' }),
    );

    expect(resultado.tipo).toBe('registrada');
    if (resultado.tipo !== 'registrada') return;
    expect(resultado.ropa.ordenId).toMatch(/^[0-9a-f-]{36}$/);

    const [operacion] = await cola(db);
    expect(operacion).toEqual([
      'PUT',
      'ordenes',
      {
        numero_boleta: '001234',
        cliente_id: ROSA.id,
        sucursal_id: QUIEN.sucursalId,
        usuario_recepcion_id: QUIEN.usuarioId,
        // Desde SPEC-KRILINXI-068, el resumen de los renglones y su suma.
        descripcion: '2 pantalones, 1 saco',
        fecha_entrada: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        fecha_estimada_salida: '2026-10-10',
        // Texto decimal, nunca un float (CLAUDE.md §6).
        precio_total: '50.00',
        estado: 'RECIBIDO',
      },
    ]);
  });

  it('sin fecha estimada, la deja vacía', async () => {
    const { control } = await baseLocalDePrueba();
    await registrarRopa(control.base, QUIEN, datosRopa());
    expect(await control.base.consultar('SELECT fecha_estimada_salida FROM ordenes')).toEqual([
      { fecha_estimada_salida: null },
    ]);
  });

  it('un precio de cero se acepta: un trabajo de cortesía', async () => {
    const { control } = await baseLocalDePrueba();
    expect(await registrarRopa(control.base, QUIEN, datosRopa(conPrecio('0')))).toMatchObject({
      tipo: 'registrada',
      ropa: { precioTotal: 0, saldo: 0 },
    });
  });

  it('con adelanto, encola el pago ADELANTO después de la orden, y el saldo lo descuenta', async () => {
    const { control, db } = await baseLocalDePrueba();
    const resultado = await registrarRopa(
      control.base,
      QUIEN,
      datosRopa({ adelanto: '20,50', metodoAdelanto: 'QR' }),
    );

    expect(resultado).toMatchObject({ tipo: 'registrada', ropa: { precioTotal: 5000, adelanto: 2050, saldo: 2950 } });
    if (resultado.tipo !== 'registrada') return;

    const operaciones = await cola(db);
    expect(operaciones.map(([op, tabla]) => [op, tabla])).toEqual([
      ['PUT', 'ordenes'],
      ['PUT', 'orden_items'],
      ['PUT', 'orden_items'],
      ['PUT', 'pagos'],
    ]);
    expect(operaciones[3]?.[2]).toEqual({
      orden_id: resultado.ropa.ordenId,
      sucursal_id: QUIEN.sucursalId,
      usuario_id: QUIEN.usuarioId,
      monto: '20.50',
      tipo: 'ADELANTO',
      metodo: 'QR',
      fecha_pago: expect.any(String),
    });
  });

  it('un adelanto igual al precio está bien: el cliente paga todo por adelantado', async () => {
    const { control } = await baseLocalDePrueba();
    expect(
      await registrarRopa(control.base, QUIEN, datosRopa({ adelanto: '50', metodoAdelanto: 'EFECTIVO' })),
    ).toMatchObject({ tipo: 'registrada', ropa: { saldo: 0 } });
  });
});

describe('Registrar ropa: lo que no se guarda — SPEC-KRILINXI-006', () => {
  it.each<[string, Partial<DatosRopa>, keyof DatosRopa, string]>([
    ['sin cliente', { cliente: null }, 'cliente', MENSAJES.sinCliente],
    ['sin boleta', { numeroBoleta: '  ' }, 'numeroBoleta', MENSAJES.sinBoleta],
    ['con boleta de 31 caracteres', { numeroBoleta: '1'.repeat(31) }, 'numeroBoleta', MENSAJES.boletaLarga],
    ['con fecha que no existe', { fechaEstimada: '2026-02-30' }, 'fechaEstimada', MENSAJES.fecha],
  ])('%s', async (_caso, cambios, campo, mensaje) => {
    const { control, db } = await baseLocalDePrueba();
    const resultado = await registrarRopa(control.base, QUIEN, datosRopa(cambios));
    expect(resultado).toEqual({ tipo: 'invalida', errores: { [campo]: mensaje } });
    expect(await cola(db)).toEqual([]);
  });

  it('una boleta de 30 caracteres sí entra', async () => {
    const { control } = await baseLocalDePrueba();
    expect(await registrarRopa(control.base, QUIEN, datosRopa({ numeroBoleta: '1'.repeat(30) }))).toMatchObject({
      tipo: 'registrada',
    });
  });

  it('rechaza una boleta ya usada en la sucursal, con el mismo mensaje que el servidor', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    await sembrar('ordenes', [{ id: randomUUID(), sucursal_id: QUIEN.sucursalId, numero_boleta: '001234' }]);

    expect(await registrarRopa(control.base, QUIEN, datosRopa({ numeroBoleta: '001234' }))).toEqual({
      tipo: 'invalida',
      errores: { numeroBoleta: 'Ese número de boleta ya está usado en esta sucursal. Revisa el papel y vuelve a escribirlo.' },
    });
    expect(await cola(db)).toEqual([]);
  });

  it('la misma boleta en OTRA sucursal no choca: cada sucursal tiene su talonario', async () => {
    const { control, sembrar } = await baseLocalDePrueba();
    await sembrar('ordenes', [{ id: randomUUID(), sucursal_id: OTRA_SUCURSAL, numero_boleta: '001234' }]);
    expect(await registrarRopa(control.base, QUIEN, datosRopa({ numeroBoleta: '001234' }))).toMatchObject({
      tipo: 'registrada',
    });
  });

  it.each<[string, Partial<DatosRopa>, Partial<Record<keyof DatosRopa, string>>]>([
    ['adelanto de cero', { adelanto: '0', metodoAdelanto: 'EFECTIVO' }, { adelanto: MENSAJES.adelanto }],
    ['adelanto que no es un número', { adelanto: 'veinte', metodoAdelanto: 'EFECTIVO' }, { adelanto: MENSAJES.adelanto }],
    ['adelanto mayor que el total', { adelanto: '50,01', metodoAdelanto: 'EFECTIVO' }, { adelanto: MENSAJES.adelantoMayor }],
    ['adelanto sin método', { adelanto: '10' }, { metodoAdelanto: MENSAJES.sinMetodo }],
  ])('con %s no guarda NADA, ni siquiera la orden', async (_caso, cambios, errores) => {
    const { control, db } = await baseLocalDePrueba();
    expect(await registrarRopa(control.base, QUIEN, datosRopa(cambios))).toEqual({
      tipo: 'invalida',
      errores,
    });
    expect(await cola(db)).toEqual([]);
    expect(await control.base.consultar('SELECT id FROM ordenes')).toEqual([]);
  });

  it('junta todos los errores a la vez, para corregirlos de una pasada', async () => {
    const { control } = await baseLocalDePrueba();
    const resultado = await registrarRopa(
      control.base,
      QUIEN,
      datosRopa({ cliente: null, numeroBoleta: '', ...conPrecio('x', 'r1') }),
    );
    expect(resultado.tipo === 'invalida' && Object.keys(resultado.errores).sort()).toEqual([
      'cliente',
      'numeroBoleta',
      'renglon:r1:precioUnitario',
    ]);
  });
});

describe('Registrar ropa sin conexión — SPEC-KRILINXI-006', () => {
  it('no hace ninguna petición a la API, ni siquiera sin internet', async () => {
    const servidor = simularApi(() => 'sin-conexion');
    const { control } = await baseLocalDePrueba();
    expect(
      await registrarRopa(control.base, QUIEN, datosRopa({ adelanto: '10', metodoAdelanto: 'EFECTIVO' })),
    ).toMatchObject({ tipo: 'registrada' });
    expect(servidor.pedidos).toEqual([]);
  });
});

describe('Registrar ropa con la hora del servidor — SPEC-KRILINXI-012', () => {
  it('con el reloj 10 minutos adelantado, sin internet, la orden y el adelanto llevan la hora del servidor', async () => {
    simularApi(() => 'sin-conexion');
    tabletConRelojCorrido(10 * 60_000);
    const { control } = await baseLocalDePrueba();

    await registrarRopa(control.base, QUIEN, datosRopa({ adelanto: '20', metodoAdelanto: 'EFECTIVO' }));

    const [orden] = await control.base.consultar('SELECT fecha_entrada FROM ordenes');
    const [pago] = await control.base.consultar('SELECT fecha_pago FROM pagos');
    expect(orden?.fecha_entrada).toBe(HORA_DEL_SERVIDOR_ISO);
    expect(pago?.fecha_pago).toBe(HORA_DEL_SERVIDOR_ISO);
  });
});

describe('Registrar ropa con un cliente nuevo, todo junto — SPEC-KRILINXI-034', () => {
  const JUAN = { tipo: 'nuevo', datos: { nombre: ' Juan Mamani ', telefono: '71-111-111', carnet: '' } } as const;

  it('da de alta al cliente y registra la ropa y el adelanto, y la cola los sube en ese orden', async () => {
    const { control, db } = await baseLocalDePrueba();
    const resultado = await registrarRopa(
      control.base,
      QUIEN,
      datosRopa({ cliente: JUAN, adelanto: '10', metodoAdelanto: 'EFECTIVO' }),
    );

    expect(resultado.tipo).toBe('registrada');
    if (resultado.tipo !== 'registrada') return;
    // El cliente nuevo, con los datos ya limpios y el id que generó la tablet.
    expect(resultado.ropa.cliente).toMatchObject({ nombre: 'Juan Mamani', telefono: '71111111', carnet: null });
    const [orden] = await control.base.consultar('SELECT cliente_id FROM ordenes');
    expect(orden?.cliente_id).toBe(resultado.ropa.cliente.id);
    // El orden de la cola es el contrato con el servidor: la orden no puede llegar antes que su cliente.
    expect((await cola(db)).map(([op, tabla]) => [op, tabla])).toEqual([
      ['PUT', 'clientes'],
      ['PUT', 'ordenes'],
      ['PUT', 'orden_items'],
      ['PUT', 'orden_items'],
      ['PUT', 'pagos'],
    ]);
  });

  it('con la ropa mal, no guarda nada: ni la orden ni el cliente nuevo', async () => {
    const { control, db } = await baseLocalDePrueba();
    const resultado = await registrarRopa(control.base, QUIEN, datosRopa({ cliente: JUAN, ...conPrecio('', 'r1') }));
    expect(resultado).toEqual({ tipo: 'invalida', errores: { 'renglon:r1:precioUnitario': MENSAJES_RENGLON.precio } });
    expect(await control.base.consultar('SELECT id FROM clientes')).toEqual([]);
    expect(await cola(db)).toEqual([]);
  });

  it('los datos del cliente nuevo se validan como en el alta, junto con los de la ropa', async () => {
    const { control } = await baseLocalDePrueba();
    const resultado = await registrarRopa(
      control.base,
      QUIEN,
      datosRopa({ cliente: { tipo: 'nuevo', datos: { nombre: ' ', telefono: '', carnet: '' } }, numeroBoleta: '' }),
    );
    expect(resultado).toEqual({
      tipo: 'invalida',
      errores: {
        clienteNombre: FALTA_NOMBRE,
        clienteTelefono: FALTA_TELEFONO,
        numeroBoleta: MENSAJES.sinBoleta,
      },
    });
  });

  it('si el teléfono ya es de otro cliente, lo dice con ese cliente y no guarda nada', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    await sembrar('clientes', [ROSA]);
    const resultado = await registrarRopa(
      control.base,
      QUIEN,
      datosRopa({ cliente: { tipo: 'nuevo', datos: { nombre: 'Otra', telefono: '7012 3456', carnet: '' } } }),
    );
    expect(resultado).toEqual({ tipo: 'telefono-ocupado', cliente: ROSA });
    expect(await cola(db)).toEqual([]);
  });
});

describe('El contenido del número de boleta — SPEC-KRILINXI-058', () => {
  const datos = (numeroBoleta: string) => ({ numeroBoleta, fechaEstimada: '' });

  it.each(['001003', 'B-1003', 'A001003', ' 001003 '])('%j es un número de boleta', async (boleta) => {
    const { control } = await baseLocalDePrueba();
    const { errores } = await validarBoleta(control.base, 'sucursal-1', datos(boleta));
    expect(errores.numeroBoleta).toBeUndefined();
  });

  it.each(['abc', '12 34', '12/34', '12.5', '---'])('%j no lo es: dice qué hacer', async (boleta) => {
    const { control } = await baseLocalDePrueba();
    const { errores } = await validarBoleta(control.base, 'sucursal-1', datos(boleta));
    expect(errores.numeroBoleta).toBe(MENSAJES.boletaInvalida);
  });

  it('el largo se revisa antes que la forma: una boleta muy larga dice que es larga', async () => {
    const { control } = await baseLocalDePrueba();
    const { errores } = await validarBoleta(control.base, 'sucursal-1', datos('a'.repeat(31)));
    expect(errores.numeroBoleta).toBe(MENSAJES.boletaLarga);
  });
});

describe('Registrar ropa renglón por renglón — SPEC-KRILINXI-068', () => {
  it('guarda cada renglón después de su orden, con su lugar, su momento y los números como texto decimal', async () => {
    const { control, db } = await baseLocalDePrueba();
    const resultado = await registrarRopa(
      control.base,
      QUIEN,
      datosRopa({
        renglones: [
          prenda({ clave: 'r1', descripcion: ' Camisa ', cantidad: '2', precioUnitario: '15' }),
          prenda({ clave: 'r2', descripcion: 'Ropa por kilo', cantidad: '2,5', precioUnitario: '3,33' }),
        ],
      }),
    );

    // 2 × 15 + 2,5 × 3,33 = 30 + 8,33 (8,325 redondeado, como Postgres).
    expect(resultado).toMatchObject({
      tipo: 'registrada',
      ropa: { precioTotal: 3833, descripcion: '2 Camisa, 2,5 Ropa por kilo' },
    });
    if (resultado.tipo !== 'registrada') return;
    const operaciones = await cola(db);
    expect(operaciones.map(([op, tabla]) => [op, tabla])).toEqual([
      ['PUT', 'ordenes'],
      ['PUT', 'orden_items'],
      ['PUT', 'orden_items'],
    ]);
    expect(operaciones[0]?.[2]).toMatchObject({ precio_total: '38.33', descripcion: '2 Camisa, 2,5 Ropa por kilo' });
    expect(operaciones[1]?.[2]).toEqual({
      orden_id: resultado.ropa.ordenId,
      sucursal_id: QUIEN.sucursalId,
      momento: 'INGRESO',
      posicion: 0,
      descripcion: 'Camisa',
      cantidad: '2.00',
      precio_unitario: '15.00',
    });
    expect(operaciones[2]?.[2]).toMatchObject({ posicion: 1, cantidad: '2.50', precio_unitario: '3.33' });
    // El id del renglón es la clave con la que se escribió: lo generó la tablet.
    expect(await control.base.consultar('SELECT id FROM orden_items ORDER BY posicion')).toEqual([{ id: 'r1' }, { id: 'r2' }]);
  });

  it.each<[string, Partial<RenglonEscrito>, string, string]>([
    ['sin descripción', { descripcion: ' ' }, 'descripcion', MENSAJES_RENGLON.sinDescripcion],
    ['con una descripción de 151 caracteres', { descripcion: 'x'.repeat(151) }, 'descripcion', MENSAJES_RENGLON.descripcionLarga],
    ['sin cantidad', { cantidad: '' }, 'cantidad', MENSAJES_RENGLON.cantidad],
    ['con cantidad cero', { cantidad: '0' }, 'cantidad', MENSAJES_RENGLON.cantidad],
    ['con una cantidad de mil', { cantidad: '1000' }, 'cantidad', MENSAJES_RENGLON.cantidadAlta],
    ['sin precio', { precioUnitario: '' }, 'precioUnitario', MENSAJES_RENGLON.precio],
    ['con precio negativo', { precioUnitario: '-5' }, 'precioUnitario', MENSAJES_RENGLON.precio],
    ['con tres decimales', { precioUnitario: '25.505' }, 'precioUnitario', MENSAJES_RENGLON.precio],
  ])('un renglón %s no se guarda, y el error va a su campo', async (_caso, cambios, campo, mensaje) => {
    const { control, db } = await baseLocalDePrueba();
    const resultado = await registrarRopa(control.base, QUIEN, datosRopa({ renglones: [prenda({ clave: 'r1', ...cambios })] }));
    expect(resultado).toEqual({ tipo: 'invalida', errores: { [`renglon:r1:${campo}`]: mensaje } });
    expect(await cola(db)).toEqual([]);
  });

  it('sin ningún renglón no hay boleta', async () => {
    const { control } = await baseLocalDePrueba();
    expect(await registrarRopa(control.base, QUIEN, datosRopa({ renglones: [] }))).toEqual({
      tipo: 'invalida',
      errores: { renglones: MENSAJES.sinRenglones },
    });
  });

  it('el adelanto se compara con el total de los renglones', async () => {
    const { control } = await baseLocalDePrueba();
    expect(
      await registrarRopa(control.base, QUIEN, datosRopa({ ...conPrecio('10'), adelanto: '10,01', metodoAdelanto: 'QR' })),
    ).toEqual({ tipo: 'invalida', errores: { adelanto: MENSAJES.adelantoMayor } });
  });

  it('un total que no entra en la base se avisa para todos los renglones juntos', async () => {
    const { control } = await baseLocalDePrueba();
    const caro = { cantidad: '100', precioUnitario: '99999999' };
    const resultado = await registrarRopa(
      control.base,
      QUIEN,
      datosRopa({ renglones: [prenda({ clave: 'r1', ...caro }), prenda({ clave: 'r2', ...caro })] }),
    );
    expect(resultado).toMatchObject({ tipo: 'invalida' });
    if (resultado.tipo !== 'invalida') return;
    expect(Object.values(resultado.errores)).toContain(MENSAJES_RENGLON.subtotalAlto);
  });
});
