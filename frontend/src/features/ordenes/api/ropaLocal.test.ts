import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import {
  clienteDePrueba,
  entregaDePrueba,
  ordenDePrueba,
  pagoDePrueba,
  SUCURSAL_DE_PRUEBA,
} from '../../../test/filasDePrueba';
import { buscarOrdenes, cambiarEstado, cobrar, listarAbiertas, MENSAJES_ACCION, obtenerOrden } from './ropaLocal';

const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });
const JUAN = clienteDePrueba({ nombre: 'Juan Mamani', telefono: '71111111' });
const QUIEN = { usuarioId: randomUUID(), sucursalId: SUCURSAL_DE_PRUEBA };

/** Una sucursal con ropa en todos los estados, para que cada test mire lo suyo. */
async function sucursalConRopa() {
  const prueba = await baseLocalDePrueba();
  const recibida = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000001', fecha_entrada: '2026-10-01T09:00:00Z' });
  const lista = ordenDePrueba({ cliente_id: JUAN.id, numero_boleta: '000002', estado: 'LISTO', fecha_entrada: '2026-09-30T09:00:00Z' });
  const anulada = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000003', estado: 'ANULADO' });
  // Entregada en la tablet, todavía sin sincronizar: la columna sigue diciendo LISTO.
  const entregada = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000004', estado: 'LISTO', precio_total: '60.00' });
  const deOtraSucursal = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000001', sucursal_id: randomUUID() });

  await prueba.sembrar('clientes', [ROSA, JUAN]);
  await prueba.sembrar('ordenes', [recibida, lista, anulada, entregada, deOtraSucursal]);
  await prueba.sembrar('pagos', [
    pagoDePrueba({ orden_id: recibida.id, monto: '20.00' }),
    pagoDePrueba({ orden_id: recibida.id, monto: '5.50', metodo: 'QR', fecha_pago: '2026-10-01T11:00:00Z' }),
  ]);
  await prueba.sembrar('entregas', [entregaDePrueba({ orden_id: entregada.id, precio_final: '70.00' })]);
  return { ...prueba, recibida, lista, anulada, entregada };
}

async function cola(db: Awaited<ReturnType<typeof baseLocalDePrueba>>['db']) {
  return ((await db.getCrudBatch(100))?.crud ?? []).map((c) => [c.op, c.table, c.opData]);
}

describe('La ropa en el local — SPEC-KRILINXI-008', () => {
  it('lista solo las abiertas de la sucursal, de la más vieja a la más nueva', async () => {
    const { control } = await sucursalConRopa();
    const abiertas = await listarAbiertas(control.base, SUCURSAL_DE_PRUEBA);
    expect(abiertas.map((o) => [o.numeroBoleta, o.estado, o.clienteNombre])).toEqual([
      ['000002', 'LISTO', 'Juan Mamani'],
      ['000001', 'RECIBIDO', 'Rosa Quispe'],
    ]);
  });

  it('calcula lo pagado y el saldo con calcularSaldo, en centavos', async () => {
    const { control, recibida } = await sucursalConRopa();
    expect(await obtenerOrden(control.base, SUCURSAL_DE_PRUEBA, recibida.id)).toMatchObject({
      precioTotal: 5000,
      precioFinal: null,
      pagado: 2550,
      saldo: 2450,
      pagos: [
        { tipo: 'ADELANTO', metodo: 'EFECTIVO', monto: 2000 },
        { tipo: 'ADELANTO', metodo: 'QR', monto: 550 },
      ],
    });
  });

  it('una orden con entrega en la tablet figura ENTREGADO aunque la columna diga LISTO, y su saldo usa el precio final', async () => {
    const { control, entregada } = await sucursalConRopa();
    expect(await obtenerOrden(control.base, SUCURSAL_DE_PRUEBA, entregada.id)).toMatchObject({
      estado: 'ENTREGADO',
      precioFinal: 7000,
      saldo: 7000,
    });
  });
});

describe('Buscar ropa — SPEC-KRILINXI-008', () => {
  it('por número de boleta, solo en la sucursal propia', async () => {
    const { control } = await sucursalConRopa();
    const encontradas = await buscarOrdenes(control.base, SUCURSAL_DE_PRUEBA, ' 000001 ');
    expect(encontradas.map((o) => o.numeroBoleta)).toEqual(['000001']);
  });

  it('por teléfono, como lo escriba el empleado, incluidas entregadas y anuladas', async () => {
    const { control } = await sucursalConRopa();
    const encontradas = await buscarOrdenes(control.base, SUCURSAL_DE_PRUEBA, '7012-3456');
    expect(encontradas.map((o) => [o.numeroBoleta, o.estado]).sort()).toEqual([
      ['000001', 'RECIBIDO'],
      ['000003', 'ANULADO'],
      ['000004', 'ENTREGADO'],
    ]);
  });

  it('sin nada escrito no devuelve nada', async () => {
    const { control } = await sucursalConRopa();
    expect(await buscarOrdenes(control.base, SUCURSAL_DE_PRUEBA, '  ')).toEqual([]);
  });
});

describe('Avanzar y anular — SPEC-KRILINXI-008', () => {
  it('avanzar escribe solo el estado, y queda en la cola como PATCH', async () => {
    const { control, db, recibida } = await sucursalConRopa();
    expect(await cambiarEstado(control.base, SUCURSAL_DE_PRUEBA, recibida.id, 'EN_PROCESO')).toEqual({ tipo: 'hecho' });
    expect(await cola(db)).toEqual([['PATCH', 'ordenes', { estado: 'EN_PROCESO' }]]);
  });

  it('se puede saltar un paso (RECIBIDO → LISTO), como en el backend', async () => {
    const { control, recibida } = await sucursalConRopa();
    expect(await cambiarEstado(control.base, SUCURSAL_DE_PRUEBA, recibida.id, 'LISTO')).toEqual({ tipo: 'hecho' });
  });

  it.each([
    ['retroceder', 'lista', 'EN_PROCESO', MENSAJES_ACCION.avance],
    ['pasar a ENTREGADO', 'lista', 'ENTREGADO', MENSAJES_ACCION.avance],
    ['tocar una anulada', 'anulada', 'LISTO', MENSAJES_ACCION.cerrada],
    ['tocar una entregada sin sincronizar', 'entregada', 'ANULADO', MENSAJES_ACCION.cerrada],
  ] as const)('no deja %s, y no escribe nada', async (_caso, cual, destino, mensaje) => {
    const prueba = await sucursalConRopa();
    expect(await cambiarEstado(prueba.control.base, SUCURSAL_DE_PRUEBA, prueba[cual].id, destino)).toEqual({
      tipo: 'no-se-puede',
      mensaje,
    });
    expect(await cola(prueba.db)).toEqual([]);
  });

  it('anular deja la orden ANULADO', async () => {
    const { control, lista } = await sucursalConRopa();
    await cambiarEstado(control.base, SUCURSAL_DE_PRUEBA, lista.id, 'ANULADO');
    expect(await obtenerOrden(control.base, SUCURSAL_DE_PRUEBA, lista.id)).toMatchObject({ estado: 'ANULADO' });
  });

  it('una orden de otra sucursal no se encuentra', async () => {
    const { control, recibida } = await sucursalConRopa();
    expect(await cambiarEstado(control.base, randomUUID(), recibida.id, 'LISTO')).toEqual({
      tipo: 'no-se-puede',
      mensaje: MENSAJES_ACCION.noEncontrada,
    });
  });
});

describe('Cobrar — SPEC-KRILINXI-008', () => {
  it('registra un ADELANTO con su método y lo deja en la cola', async () => {
    const { control, db, recibida } = await sucursalConRopa();
    expect(await cobrar(control.base, QUIEN, recibida.id, { monto: '10,50', metodo: 'TARJETA' })).toEqual({ tipo: 'hecho' });

    expect(await cola(db)).toEqual([
      [
        'PUT',
        'pagos',
        expect.objectContaining({ orden_id: recibida.id, monto: '10.50', tipo: 'ADELANTO', metodo: 'TARJETA' }),
      ],
    ]);
    expect(await obtenerOrden(control.base, SUCURSAL_DE_PRUEBA, recibida.id)).toMatchObject({ saldo: 1400 });
  });

  it('puede cobrar exactamente lo que falta', async () => {
    const { control, recibida } = await sucursalConRopa();
    expect(await cobrar(control.base, QUIEN, recibida.id, { monto: '24,50', metodo: 'EFECTIVO' })).toEqual({ tipo: 'hecho' });
  });

  it.each([
    ['cero', { monto: '0', metodo: 'EFECTIVO' }, MENSAJES_ACCION.monto],
    ['algo que no es un monto', { monto: 'diez', metodo: 'EFECTIVO' }, MENSAJES_ACCION.monto],
    ['más de lo que falta', { monto: '24,51', metodo: 'EFECTIVO' }, MENSAJES_ACCION.montoMayor],
    ['sin método', { monto: '10', metodo: null }, MENSAJES_ACCION.sinMetodo],
  ] as const)('no cobra %s', async (_caso, datos, mensaje) => {
    const { control, db, recibida } = await sucursalConRopa();
    expect(await cobrar(control.base, QUIEN, recibida.id, datos)).toEqual({ tipo: 'no-se-puede', mensaje });
    expect(await cola(db)).toEqual([]);
  });

  it.each(['anulada', 'entregada'] as const)('no cobra en una orden %s', async (cual) => {
    const prueba = await sucursalConRopa();
    expect(await cobrar(prueba.control.base, QUIEN, prueba[cual].id, { monto: '1', metodo: 'EFECTIVO' })).toEqual({
      tipo: 'no-se-puede',
      mensaje: MENSAJES_ACCION.cerrada,
    });
  });
});

describe('La ropa sin conexión — SPEC-KRILINXI-008', () => {
  it('lista, busca, avanza y cobra sin una sola petición a la API', async () => {
    const servidor = simularApi(() => 'sin-conexion');
    const { control, recibida } = await sucursalConRopa();
    await listarAbiertas(control.base, SUCURSAL_DE_PRUEBA);
    await buscarOrdenes(control.base, SUCURSAL_DE_PRUEBA, '000001');
    await cambiarEstado(control.base, SUCURSAL_DE_PRUEBA, recibida.id, 'EN_PROCESO');
    await cobrar(control.base, QUIEN, recibida.id, { monto: '1', metodo: 'QR' });
    expect(servidor.pedidos).toEqual([]);
  });
});
