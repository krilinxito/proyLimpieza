import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { HORA_DEL_SERVIDOR_ISO, tabletConRelojCorrido } from '../../../test/reloj';
import type { DatosRopa, QuienRegistra } from '../types';
import { FALTA_NOMBRE, FALTA_TELEFONO } from '../../clientes/api/clientesLocal';
import { MENSAJES, registrarRopa, validarRopa } from './ordenesLocal';

const ROSA = { id: randomUUID(), nombre: 'Rosa Quispe', telefono: '70123456', carnet: null };
const QUIEN: QuienRegistra = { usuarioId: randomUUID(), sucursalId: randomUUID() };
const OTRA_SUCURSAL = randomUUID();

/** Una ropa válida; cada test cambia solo lo que le importa. */
function datosRopa(cambios: Partial<DatosRopa> = {}): DatosRopa {
  return {
    cliente: { tipo: 'existente', cliente: ROSA },
    numeroBoleta: '001234',
    descripcion: '2 pantalones, 1 saco',
    precio: '50',
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
      datosRopa({ numeroBoleta: ' 001234 ', precio: '25,50', fechaEstimada: '2026-10-10' }),
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
        descripcion: '2 pantalones, 1 saco',
        fecha_entrada: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        fecha_estimada_salida: '2026-10-10',
        // Texto decimal, nunca un float (CLAUDE.md §6).
        precio_total: '25.50',
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
    expect(await registrarRopa(control.base, QUIEN, datosRopa({ precio: '0' }))).toMatchObject({
      tipo: 'registrada',
      ropa: { precioTotal: 0, saldo: 0 },
    });
  });

  it('con adelanto, encola el pago ADELANTO después de la orden, y el saldo lo descuenta', async () => {
    const { control, db } = await baseLocalDePrueba();
    const resultado = await registrarRopa(
      control.base,
      QUIEN,
      datosRopa({ precio: '50', adelanto: '20,50', metodoAdelanto: 'QR' }),
    );

    expect(resultado).toMatchObject({ tipo: 'registrada', ropa: { precioTotal: 5000, adelanto: 2050, saldo: 2950 } });
    if (resultado.tipo !== 'registrada') return;

    const operaciones = await cola(db);
    expect(operaciones.map(([op, tabla]) => [op, tabla])).toEqual([
      ['PUT', 'ordenes'],
      ['PUT', 'pagos'],
    ]);
    expect(operaciones[1]?.[2]).toEqual({
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
      await registrarRopa(control.base, QUIEN, datosRopa({ precio: '50', adelanto: '50', metodoAdelanto: 'EFECTIVO' })),
    ).toMatchObject({ tipo: 'registrada', ropa: { saldo: 0 } });
  });
});

describe('Registrar ropa: lo que no se guarda — SPEC-KRILINXI-006', () => {
  it.each<[string, Partial<DatosRopa>, keyof DatosRopa, string]>([
    ['sin cliente', { cliente: null }, 'cliente', MENSAJES.sinCliente],
    ['sin boleta', { numeroBoleta: '  ' }, 'numeroBoleta', MENSAJES.sinBoleta],
    ['con boleta de 31 caracteres', { numeroBoleta: '1'.repeat(31) }, 'numeroBoleta', MENSAJES.boletaLarga],
    ['sin descripción', { descripcion: ' ' }, 'descripcion', MENSAJES.sinDescripcion],
    ['sin precio', { precio: '' }, 'precio', MENSAJES.precio],
    ['con precio negativo', { precio: '-5' }, 'precio', MENSAJES.precio],
    ['con tres decimales', { precio: '25.505' }, 'precio', MENSAJES.precio],
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
    ['adelanto mayor que el precio', { adelanto: '50,01', metodoAdelanto: 'EFECTIVO' }, { adelanto: MENSAJES.adelantoMayor }],
    ['adelanto sin método', { adelanto: '10' }, { metodoAdelanto: MENSAJES.sinMetodo }],
  ])('con %s no guarda NADA, ni siquiera la orden', async (_caso, cambios, errores) => {
    const { control, db } = await baseLocalDePrueba();
    expect(await registrarRopa(control.base, QUIEN, datosRopa({ precio: '50', ...cambios }))).toEqual({
      tipo: 'invalida',
      errores,
    });
    expect(await cola(db)).toEqual([]);
    expect(await control.base.consultar('SELECT id FROM ordenes')).toEqual([]);
  });

  it('junta todos los errores a la vez, para corregirlos de una pasada', async () => {
    const { control } = await baseLocalDePrueba();
    const resultado = await registrarRopa(control.base, QUIEN, datosRopa({ cliente: null, numeroBoleta: '', precio: 'x' }));
    expect(resultado.tipo === 'invalida' && Object.keys(resultado.errores).sort()).toEqual([
      'cliente',
      'numeroBoleta',
      'precio',
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
      ['PUT', 'pagos'],
    ]);
  });

  it('con la ropa mal, no guarda nada: ni la orden ni el cliente nuevo', async () => {
    const { control, db } = await baseLocalDePrueba();
    const resultado = await registrarRopa(control.base, QUIEN, datosRopa({ cliente: JUAN, precio: '' }));
    expect(resultado).toEqual({ tipo: 'invalida', errores: { precio: MENSAJES.precio } });
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
  const datos = (numeroBoleta: string) => ({ numeroBoleta, descripcion: 'Camisa', precio: '10', fechaEstimada: '' });

  it.each(['001003', 'B-1003', 'A001003', ' 001003 '])('%j es un número de boleta', async (boleta) => {
    const { control } = await baseLocalDePrueba();
    const { errores } = await validarRopa(control.base, 'sucursal-1', datos(boleta));
    expect(errores.numeroBoleta).toBeUndefined();
  });

  it.each(['abc', '12 34', '12/34', '12.5', '---'])('%j no lo es: dice qué hacer', async (boleta) => {
    const { control } = await baseLocalDePrueba();
    const { errores } = await validarRopa(control.base, 'sucursal-1', datos(boleta));
    expect(errores.numeroBoleta).toBe(MENSAJES.boletaInvalida);
  });

  it('el largo se revisa antes que la forma: una boleta muy larga dice que es larga', async () => {
    const { control } = await baseLocalDePrueba();
    const { errores } = await validarRopa(control.base, 'sucursal-1', datos('a'.repeat(31)));
    expect(errores.numeroBoleta).toBe(MENSAJES.boletaLarga);
  });
});
