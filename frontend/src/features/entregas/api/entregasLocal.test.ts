import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { obtenerOrden } from '../../ordenes/api/ropaLocal';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { HORA_DEL_SERVIDOR_ISO, tabletConRelojCorrido } from '../../../test/reloj';
import {
  clienteDePrueba,
  entregaDePrueba,
  ordenDePrueba,
  pagoDePrueba,
  SUCURSAL_DE_PRUEBA,
} from '../../../test/filasDePrueba';
import { MENSAJES_RENGLON, type RenglonEscrito } from '../../ordenes/renglones';
import type { DatosEntrega } from '../types';
import { MENSAJES_ENTREGA, prepararEntrega, registrarEntrega } from './entregasLocal';

const ROSA = clienteDePrueba();
const QUIEN = { usuarioId: randomUUID(), sucursalId: SUCURSAL_DE_PRUEBA };

/**
 * Una entrega con boleta, al precio de la orden y pagando lo que falta (Bs 30: la orden es de 50 y dejó 20 de adelanto);
 * cada test cambia lo suyo. Desde SPEC-KRILINXI-056 la ropa solo sale con la boleta pagada por completo.
 */
function datosEntrega(cambios: Partial<DatosEntrega> = {}): DatosEntrega {
  return {
    traeBoleta: true,
    retiradoPorNombre: '',
    retiradoPorCarnet: '',
    cargos: [],
    pagoFinal: '30',
    metodoPago: 'EFECTIVO',
    ...cambios,
  };
}

/** Un cargo al entregar (SPEC-KRILINXI-068): un recargo de Bs 15,50, salvo lo que el test cambie. */
function cargo(campos: Partial<RenglonEscrito> = {}): RenglonEscrito {
  return { clave: randomUUID(), descripcion: 'Recargo por almacenamiento', cantidad: '1', precioUnitario: '15,50', ...campos };
}

/** Una orden LISTO de Bs 50 con Bs 20 de adelanto, más una anulada y una ya entregada. */
async function preparar() {
  const prueba = await baseLocalDePrueba();
  const lista = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001234', estado: 'LISTO' });
  const anulada = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001235', estado: 'ANULADO' });
  const entregada = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001236', estado: 'LISTO' });
  await prueba.sembrar('clientes', [ROSA]);
  await prueba.sembrar('ordenes', [lista, anulada, entregada]);
  await prueba.sembrar('pagos', [pagoDePrueba({ orden_id: lista.id, monto: '20.00' })]);
  await prueba.sembrar('entregas', [entregaDePrueba({ orden_id: entregada.id })]);
  const cola = async () => ((await prueba.db.getCrudBatch(100))?.crud ?? []).map((c) => [c.op, c.table, c.opData]);
  return { ...prueba, lista, anulada, entregada, cola };
}

describe('Entregar: lo que se guarda — SPEC-KRILINXI-009', () => {
  it('guarda el pago final y la entrega con boleta, en ese orden, sin tocar el estado de la orden', async () => {
    const { control, lista, cola } = await preparar();
    const resultado = await registrarEntrega(
      control.base,
      QUIEN,
      lista.id,
      datosEntrega({ pagoFinal: '30', metodoPago: 'QR' }),
    );

    expect(resultado).toMatchObject({ tipo: 'lista', entrega: { tipoRetiro: 'CON_BOLETA', pagoFinal: 3000 } });
    // SPEC-KRILINXI-056: primero el pago, después la entrega. La cola los sube en ese orden y el servidor mira lo cobrado
    // al recibir la entrega.
    expect(await cola()).toEqual([
      ['PUT', 'pagos', expect.objectContaining({ orden_id: lista.id, monto: '30.00', tipo: 'PAGO_FINAL', metodo: 'QR' })],
      [
        'PUT',
        'entregas',
        {
          orden_id: lista.id,
          sucursal_id: SUCURSAL_DE_PRUEBA,
          fecha_entrega: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          tipo_retiro: 'CON_BOLETA',
          usuario_entrega_id: QUIEN.usuarioId,
          precio_final: '50.00',
        },
      ],
    ]);
  });

  it('nunca escribe un PATCH de ordenes: el paso a ENTREGADO es del servidor', async () => {
    const { control, lista, cola } = await preparar();
    await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega());
    expect((await cola()).filter(([op, tabla]) => op === 'PATCH' && tabla === 'ordenes')).toEqual([]);
    // La columna sigue como estaba…
    expect(await control.base.consultar('SELECT estado FROM ordenes WHERE id = ?', [lista.id])).toEqual([{ estado: 'LISTO' }]);
    // …y aun así la orden se ve entregada.
    expect(await obtenerOrden(control.base, SUCURSAL_DE_PRUEBA, lista.id)).toMatchObject({ estado: 'ENTREGADO' });
  });

  it('sin boleta guarda nombre y carnet de quien retira', async () => {
    const { control, lista, cola } = await preparar();
    await registrarEntrega(
      control.base,
      QUIEN,
      lista.id,
      datosEntrega({ traeBoleta: false, retiradoPorNombre: ' Juan Mamani ', retiradoPorCarnet: ' 445566 ' }),
    );
    expect((await cola()).find(([, tabla]) => tabla === 'entregas')?.[2]).toMatchObject({
      tipo_retiro: 'SIN_BOLETA',
      retirado_por_nombre: 'Juan Mamani',
      retirado_por_carnet: '445566',
    });
  });

  it('un recargo sube el precio final, pero hay que cobrarlo en el mismo acto (SPEC-KRILINXI-068)', async () => {
    const { control, lista } = await preparar();
    // Con el recargo la boleta sube a 65,50: lo cobrado (20) más lo que se paga ahora (45,50) la deja pagada.
    const resultado = await prepararEntrega(
      control.base,
      SUCURSAL_DE_PRUEBA,
      lista.id,
      datosEntrega({ cargos: [cargo()], pagoFinal: '45,50' }),
    );
    expect(resultado).toMatchObject({ tipo: 'lista', entrega: { precioFinal: 6550, pagoFinal: 4550 } });
    // Cobrando solo los 30 de antes, faltan 15,50 del recargo.
    expect(await prepararEntrega(control.base, SUCURSAL_DE_PRUEBA, lista.id, datosEntrega({ cargos: [cargo()] }))).toEqual({
      tipo: 'invalida',
      errores: { pagoFinal: MENSAJES_ENTREGA.faltaCobrar(1550) },
    });
  });

  it('no se entrega con saldo pendiente: dice cuánto falta cobrar y no escribe nada — SPEC-KRILINXI-056', async () => {
    const { control, lista, cola } = await preparar();

    // Pagando solo 15 de los 30 que faltan.
    expect(await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega({ pagoFinal: '15' }))).toEqual({
      tipo: 'invalida',
      errores: { pagoFinal: MENSAJES_ENTREGA.faltaCobrar(1500) },
    });
    // Sin pagar nada.
    expect(await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega({ pagoFinal: '', metodoPago: null }))).toEqual({
      tipo: 'invalida',
      errores: { pagoFinal: MENSAJES_ENTREGA.faltaCobrar(3000) },
    });
    expect(await cola()).toEqual([]);
    expect(MENSAJES_ENTREGA.faltaCobrar(1500)).toBe('Falta cobrar Bs 15,00. Escribe cuánto paga ahora para dejar la boleta pagada.');
  });

  it('una boleta ya pagada se entrega sin cobrar nada — SPEC-KRILINXI-056', async () => {
    const { control, lista, cola } = await preparar();
    await control.base.ejecutar(
      "INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo, usuario_id, fecha_pago) VALUES (?, ?, ?, '30.00', 'PAGO_FINAL', 'EFECTIVO', ?, ?)",
      [randomUUID(), lista.id, SUCURSAL_DE_PRUEBA, QUIEN.usuarioId, HORA_DEL_SERVIDOR_ISO],
    );
    const antes = (await cola()).length;

    const resultado = await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega({ pagoFinal: '', metodoPago: null }));

    expect(resultado).toMatchObject({ tipo: 'lista', entrega: { pagoFinal: 0 } });
    expect((await cola()).slice(antes).map(([op, tabla]) => [op, tabla])).toEqual([['PUT', 'entregas']]);
  });

  it('preparar no escribe nada', async () => {
    const { control, lista, cola } = await preparar();
    await prepararEntrega(control.base, SUCURSAL_DE_PRUEBA, lista.id, datosEntrega({ pagoFinal: '30', metodoPago: 'QR' }));
    expect(await cola()).toEqual([]);
  });
});

describe('Entregar: lo que no se guarda — SPEC-KRILINXI-009', () => {
  it.each<[string, Partial<DatosEntrega>, Partial<Record<keyof DatosEntrega, string>>]>([
    ['sin elegir si trae la boleta', { traeBoleta: null }, { traeBoleta: MENSAJES_ENTREGA.sinBoletaElegida }],
    [
      'sin boleta y sin nombre ni carnet',
      { traeBoleta: false },
      { retiradoPorNombre: MENSAJES_ENTREGA.sinNombre, retiradoPorCarnet: MENSAJES_ENTREGA.sinCarnet },
    ],
    [
      'sin boleta con un nombre de 151 letras',
      { traeBoleta: false, retiradoPorNombre: 'a'.repeat(151), retiradoPorCarnet: '1' },
      { retiradoPorNombre: MENSAJES_ENTREGA.nombreLargo },
    ],
    [
      'sin boleta con un carnet de 31 caracteres',
      { traeBoleta: false, retiradoPorNombre: 'Juan', retiradoPorCarnet: '1'.repeat(31) },
      { retiradoPorCarnet: MENSAJES_ENTREGA.carnetLargo },
    ],
    ['con un pago de cero', { pagoFinal: '0', metodoPago: 'EFECTIVO' }, { pagoFinal: MENSAJES_ENTREGA.pago }],
    ['con un pago mayor que lo que falta', { pagoFinal: '30,01', metodoPago: 'EFECTIVO' }, { pagoFinal: MENSAJES_ENTREGA.pagoMayor }],
    ['con un pago sin método', { pagoFinal: '30', metodoPago: null }, { metodoPago: MENSAJES_ENTREGA.sinMetodo }],
  ])('%s', async (_caso, cambios, errores) => {
    const { control, lista, cola } = await preparar();
    expect(await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega(cambios))).toEqual({ tipo: 'invalida', errores });
    expect(await cola()).toEqual([]);
  });

  it('un nombre de 150 letras y un carnet de 30 sí entran', async () => {
    const { control, lista } = await preparar();
    expect(
      await registrarEntrega(
        control.base,
        QUIEN,
        lista.id,
        datosEntrega({ traeBoleta: false, retiradoPorNombre: 'a'.repeat(150), retiradoPorCarnet: '1'.repeat(30) }),
      ),
    ).toMatchObject({ tipo: 'lista' });
  });

  it.each([
    ['anulada', MENSAJES_ENTREGA.anulada],
    ['entregada', MENSAJES_ENTREGA.yaEntregada],
  ] as const)('una orden %s no se entrega, y dice por qué', async (cual, mensaje) => {
    const prueba = await preparar();
    expect(await registrarEntrega(prueba.control.base, QUIEN, prueba[cual].id, datosEntrega())).toEqual({
      tipo: 'no-se-puede',
      mensaje,
    });
    expect(await prueba.cola()).toEqual([]);
  });

  it('no se entrega dos veces: la segunda vez ya figura entregada', async () => {
    const { control, lista, cola } = await preparar();
    await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega());
    expect(await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega())).toEqual({
      tipo: 'no-se-puede',
      mensaje: MENSAJES_ENTREGA.yaEntregada,
    });
    expect((await cola()).filter(([, tabla]) => tabla === 'entregas')).toHaveLength(1);
  });

  it('una orden de otra sucursal no se encuentra: la ropa se retira donde se dejó', async () => {
    const { control, lista } = await preparar();
    expect(await registrarEntrega(control.base, { ...QUIEN, sucursalId: randomUUID() }, lista.id, datosEntrega())).toEqual({
      tipo: 'no-se-puede',
      mensaje: MENSAJES_ENTREGA.noEncontrada,
    });
  });
});

describe('Entregar sin conexión — SPEC-KRILINXI-009', () => {
  it('no hace ninguna petición a la API', async () => {
    const servidor = simularApi(() => 'sin-conexion');
    const { control, lista } = await preparar();
    await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega({ pagoFinal: '30', metodoPago: 'EFECTIVO' }));
    expect(servidor.pedidos).toEqual([]);
  });
});

describe('Entregar con la hora del servidor — SPEC-KRILINXI-012', () => {
  it('con el reloj adelantado y sin internet, la entrega y el pago final llevan la hora del servidor', async () => {
    simularApi(() => 'sin-conexion');
    tabletConRelojCorrido(10 * 60_000);
    const { control, lista } = await preparar();

    await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega({ pagoFinal: '30', metodoPago: 'EFECTIVO' }));

    expect(await control.base.consultar('SELECT fecha_entrega FROM entregas WHERE orden_id = ?', [lista.id])).toEqual([
      { fecha_entrega: HORA_DEL_SERVIDOR_ISO },
    ]);
    expect(
      await control.base.consultar("SELECT fecha_pago FROM pagos WHERE orden_id = ? AND tipo = 'PAGO_FINAL'", [lista.id]),
    ).toEqual([{ fecha_pago: HORA_DEL_SERVIDOR_ISO }]);
  });
});

describe('Entregar con cargos — SPEC-KRILINXI-068', () => {
  it('guarda los cargos, el pago y la entrega, en ese orden, con el precio final calculado', async () => {
    const { control, lista, cola } = await preparar();
    const resultado = await registrarEntrega(
      control.base,
      QUIEN,
      lista.id,
      datosEntrega({
        cargos: [cargo({ clave: 'c1' }), cargo({ clave: 'c2', descripcion: 'Planchado extra', cantidad: '2', precioUnitario: '5' })],
        // 50 + 15,50 + 2 × 5 = 75,50; ya pagó 20.
        pagoFinal: '55,50',
      }),
    );

    expect(resultado).toMatchObject({ tipo: 'lista', entrega: { precioFinal: 7550, pagoFinal: 5550 } });
    const operaciones = await cola();
    expect(operaciones.map(([op, tabla]) => [op, tabla])).toEqual([
      ['PUT', 'orden_items'],
      ['PUT', 'orden_items'],
      ['PUT', 'pagos'],
      ['PUT', 'entregas'],
    ]);
    expect(operaciones[0]?.[2]).toEqual({
      orden_id: lista.id,
      sucursal_id: SUCURSAL_DE_PRUEBA,
      momento: 'ENTREGA',
      posicion: 0,
      descripcion: 'Recargo por almacenamiento',
      cantidad: '1.00',
      precio_unitario: '15.50',
    });
    expect(operaciones[1]?.[2]).toMatchObject({ posicion: 1, cantidad: '2.00', precio_unitario: '5.00' });
    expect(operaciones[3]?.[2]).toMatchObject({ precio_final: '75.50' });
  });

  it('sin cargos, el precio final es el de la boleta', async () => {
    const { control, lista, cola } = await preparar();
    await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega());
    const entrega = (await cola()).find(([, tabla]) => tabla === 'entregas');
    expect(entrega?.[2]).toMatchObject({ precio_final: '50.00' });
  });

  it('la orden con sus cargos ya guardados los muestra como renglones de ENTREGA, y suman al precio final', async () => {
    const { control, lista } = await preparar();
    await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega({ cargos: [cargo()], pagoFinal: '45,50' }));

    const orden = await obtenerOrden(control.base, SUCURSAL_DE_PRUEBA, lista.id);
    expect(orden?.renglones).toEqual([
      expect.objectContaining({ momento: 'ENTREGA', descripcion: 'Recargo por almacenamiento', subtotal: 1550 }),
    ]);
    expect(orden?.precioFinal).toBe(6550);
  });

  it.each<[string, Partial<RenglonEscrito>, string, string]>([
    ['sin descripción', { descripcion: '' }, 'descripcion', MENSAJES_RENGLON.sinDescripcion],
    ['con cantidad cero', { cantidad: '0' }, 'cantidad', MENSAJES_RENGLON.cantidad],
    ['con un precio que no es un número', { precioUnitario: 'quince' }, 'precioUnitario', MENSAJES_RENGLON.precio],
  ])('un cargo %s no deja entregar, y no escribe nada', async (_caso, cambios, campo, mensaje) => {
    const { control, lista, cola } = await preparar();
    const resultado = await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega({ cargos: [cargo({ clave: 'c1', ...cambios })] }));
    expect(resultado).toMatchObject({ tipo: 'invalida', errores: { [`renglon:c1:${campo}`]: mensaje } });
    expect(await cola()).toEqual([]);
  });
});
