import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { clienteDePrueba, entregaDePrueba, ordenDePrueba, pagoDePrueba, SUCURSAL_DE_PRUEBA } from '../../../test/filasDePrueba';
import { hoyEnLaSucursal } from './hoyLocal';

const HOY = '2026-10-18';
const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe' });

async function sucursal() {
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  return prueba;
}

const boletas = (ordenes: { numeroBoleta: string }[]) => ordenes.map((o) => o.numeroBoleta);

describe('Hoy en la sucursal: la ropa — SPEC-KRILINXI-035 y SPEC-KRILINXI-067', () => {
  it('por entregar: toda la ropa que sigue en el local, la más vieja arriba, sin la entregada sin sincronizar', async () => {
    const { control, sembrar } = await sucursal();
    const entregada = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000004', estado: 'RECIBIDO', fecha_entrada: '2026-09-01T10:00:00Z' });
    await sembrar('ordenes', [
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000002', estado: 'RECIBIDO', fecha_entrada: '2026-10-10T10:00:00Z' }),
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000001', estado: 'RECIBIDO', fecha_entrada: '2026-10-01T10:00:00Z' }),
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000003', estado: 'RECIBIDO', fecha_entrada: '2026-10-12T10:00:00Z' }),
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000005', estado: 'RECIBIDO', sucursal_id: randomUUID() }),
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000006', estado: 'ANULADO' }),
      entregada,
    ]);
    await sembrar('entregas', [entregaDePrueba({ orden_id: entregada.id })]);

    const { porEntregar } = await hoyEnLaSucursal(control.base, SUCURSAL_DE_PRUEBA, HOY);
    expect(boletas(porEntregar)).toEqual(['000001', '000002', '000003']);
  });

  it('atrasada: la que sigue en el local con la fecha estimada ya pasada, la más atrasada arriba', async () => {
    const { control, sembrar } = await sucursal();
    await sembrar('ordenes', [
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000010', estado: 'RECIBIDO', fecha_estimada_salida: '2026-10-17' }),
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000011', estado: 'RECIBIDO', fecha_estimada_salida: '2026-10-12' }),
      // Para hoy todavía no está atrasada; sin fecha, tampoco; una anulada ya no cuenta.
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000012', estado: 'RECIBIDO', fecha_estimada_salida: HOY }),
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000013', estado: 'RECIBIDO', fecha_estimada_salida: null }),
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000014', estado: 'ANULADO', fecha_estimada_salida: '2026-10-01' }),
    ]);

    const { atrasadas } = await hoyEnLaSucursal(control.base, SUCURSAL_DE_PRUEBA, HOY);
    expect(boletas(atrasadas)).toEqual(['000011', '000010']);
  });

  it('SPEC-KRILINXI-067: una tablet con boletas guardadas como LISTO o EN_PROCESO las cuenta como por entregar', async () => {
    const { control, sembrar } = await sucursal();
    await sembrar('ordenes', [
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000020', estado: 'LISTO', fecha_entrada: '2026-10-01T10:00:00Z' }),
      ordenDePrueba({
        cliente_id: ROSA.id,
        numero_boleta: '000021',
        estado: 'EN_PROCESO',
        fecha_entrada: '2026-10-02T10:00:00Z',
        fecha_estimada_salida: '2026-10-10',
      }),
    ]);

    const { porEntregar, atrasadas } = await hoyEnLaSucursal(control.base, SUCURSAL_DE_PRUEBA, HOY);
    expect(boletas(porEntregar)).toEqual(['000020', '000021']);
    expect(boletas(atrasadas)).toEqual(['000021']);
  });
});

describe('Hoy en la sucursal: lo cobrado — SPEC-KRILINXI-035', () => {
  it('suma lo de hoy en Bolivia por forma de pago, en centavos, con los dos formatos de fecha', async () => {
    const { control, sembrar } = await sucursal();
    const orden = ordenDePrueba({ cliente_id: ROSA.id });
    await sembrar('ordenes', [orden]);
    await sembrar('pagos', [
      // Hoy a la mañana, escrito en la tablet.
      pagoDePrueba({ orden_id: orden.id, monto: '20.10', metodo: 'EFECTIVO', fecha_pago: '2026-10-18T13:00:00.000Z' }),
      // Hoy a las 21:00 de Bolivia, bajado del servidor sin zona: en UTC ya es el 19.
      pagoDePrueba({ orden_id: orden.id, monto: '0.20', metodo: 'EFECTIVO', fecha_pago: '2026-10-19 01:00:00' }),
      pagoDePrueba({ orden_id: orden.id, monto: '15.00', metodo: 'QR', fecha_pago: '2026-10-18 15:00:00' }),
      // Ayer a las 23:00 de Bolivia (03:00 UTC de hoy): no es de hoy.
      pagoDePrueba({ orden_id: orden.id, monto: '99.00', metodo: 'TARJETA', fecha_pago: '2026-10-18 03:00:00' }),
      // De otra sucursal.
      pagoDePrueba({ orden_id: orden.id, monto: '50.00', metodo: 'QR', sucursal_id: randomUUID(), fecha_pago: '2026-10-18 15:00:00' }),
    ]);

    const { cobrado } = await hoyEnLaSucursal(control.base, SUCURSAL_DE_PRUEBA, HOY);
    // 20,10 + 0,20 = 20,30 exacto: con floats daría 20.299999…
    expect(cobrado).toEqual({
      total: 3530,
      porMetodo: [
        { metodo: 'EFECTIVO', monto: 2030 },
        { metodo: 'QR', monto: 1500 },
      ],
    });
  });

  it('sin cobros hoy, total cero y sin desglose', async () => {
    const { control } = await sucursal();
    expect((await hoyEnLaSucursal(control.base, SUCURSAL_DE_PRUEBA, HOY)).cobrado).toEqual({ total: 0, porMetodo: [] });
  });
});
