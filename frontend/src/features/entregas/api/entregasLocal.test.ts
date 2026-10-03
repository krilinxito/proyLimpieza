import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { obtenerOrden } from '../../ordenes/api/ropaLocal';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import {
  clienteDePrueba,
  entregaDePrueba,
  ordenDePrueba,
  pagoDePrueba,
  SUCURSAL_DE_PRUEBA,
} from '../../../test/filasDePrueba';
import type { DatosEntrega } from '../types';
import { MENSAJES_ENTREGA, prepararEntrega, registrarEntrega } from './entregasLocal';

const ROSA = clienteDePrueba();
const QUIEN = { usuarioId: randomUUID(), sucursalId: SUCURSAL_DE_PRUEBA };

/** Una entrega con boleta, al precio de la orden y sin cobrar nada; cada test cambia lo suyo. */
function datosEntrega(cambios: Partial<DatosEntrega> = {}): DatosEntrega {
  return {
    traeBoleta: true,
    retiradoPorNombre: '',
    retiradoPorCarnet: '',
    precioFinal: '50.00',
    pagoFinal: '',
    metodoPago: null,
    ...cambios,
  };
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
  it('guarda la entrega con boleta y el pago final, en ese orden, sin tocar el estado de la orden', async () => {
    const { control, lista, cola } = await preparar();
    const resultado = await registrarEntrega(
      control.base,
      QUIEN,
      lista.id,
      datosEntrega({ pagoFinal: '30', metodoPago: 'QR' }),
    );

    expect(resultado).toMatchObject({ tipo: 'lista', entrega: { tipoRetiro: 'CON_BOLETA', pagoFinal: 3000, saldoDespues: 0 } });
    expect(await cola()).toEqual([
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
      ['PUT', 'pagos', expect.objectContaining({ orden_id: lista.id, monto: '30.00', tipo: 'PAGO_FINAL', metodo: 'QR' })],
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
    expect((await cola())[0]?.[2]).toMatchObject({
      tipo_retiro: 'SIN_BOLETA',
      retirado_por_nombre: 'Juan Mamani',
      retirado_por_carnet: '445566',
    });
  });

  it('el precio final puede cambiar (recargo), y el saldo se calcula con él', async () => {
    const { control, lista } = await preparar();
    const resultado = await prepararEntrega(control.base, SUCURSAL_DE_PRUEBA, lista.id, datosEntrega({ precioFinal: '65,50' }));
    expect(resultado).toMatchObject({ tipo: 'lista', entrega: { precioFinal: 6550, saldoDespues: 4550 } });
  });

  it('un precio final de cero también vale (se perdonó el cobro)', async () => {
    const { control, lista } = await preparar();
    expect(
      await prepararEntrega(control.base, SUCURSAL_DE_PRUEBA, lista.id, datosEntrega({ precioFinal: '0' })),
    ).toMatchObject({ tipo: 'lista', entrega: { precioFinal: 0, saldoDespues: -2000 } });
  });

  it('se puede entregar con saldo pendiente: preparar dice cuánto queda debiendo', async () => {
    const { control, lista } = await preparar();
    expect(
      await prepararEntrega(control.base, SUCURSAL_DE_PRUEBA, lista.id, datosEntrega({ pagoFinal: '15', metodoPago: 'EFECTIVO' })),
    ).toMatchObject({ tipo: 'lista', entrega: { saldoDespues: 1500 } });
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
    ['con un precio final que no es un número', { precioFinal: 'cincuenta' }, { precioFinal: MENSAJES_ENTREGA.precioFinal }],
    ['con un precio final negativo', { precioFinal: '-1' }, { precioFinal: MENSAJES_ENTREGA.precioFinal }],
    ['con un pago de cero', { pagoFinal: '0', metodoPago: 'EFECTIVO' }, { pagoFinal: MENSAJES_ENTREGA.pago }],
    ['con un pago mayor que lo que falta', { pagoFinal: '30,01', metodoPago: 'EFECTIVO' }, { pagoFinal: MENSAJES_ENTREGA.pagoMayor }],
    ['con un pago sin método', { pagoFinal: '10' }, { metodoPago: MENSAJES_ENTREGA.sinMetodo }],
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
    await registrarEntrega(control.base, QUIEN, lista.id, datosEntrega({ pagoFinal: '10', metodoPago: 'EFECTIVO' }));
    expect(servidor.pedidos).toEqual([]);
  });
});
