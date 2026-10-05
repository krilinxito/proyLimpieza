import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as pagos from '../../src/models/pagos.model.js';
import { contar, crearOrden, crearSucursal, escenario, mientrasSeAnula } from '../helpers/baseReal.js';

// Contra Postgres real: lo que el test de `tests/unit/pagos.model.test.ts` no
// puede probar con un doble del pool. Aquel comprueba qué SQL arma el model;
// este, que Postgres haga con ese SQL lo que el model promete.

function nuevoPago(ordenId: string, usuarioId: string) {
  return {
    id: randomUUID(),
    ordenId,
    monto: 2000,
    tipo: 'ADELANTO',
    metodo: 'EFECTIVO',
    usuarioId,
    fechaPago: null,
  } as const;
}

const pagosDe = (ordenId: string) => contar('SELECT count(*) FROM pagos WHERE orden_id = $1', [ordenId]);

describe('Pagos contra la base real — SPEC-ALE186-007', () => {
  it('guarda el pago con la sucursal de la orden y el monto exacto', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    const resultado = await pagos.crear(nuevoPago(orden.id, esc.usuarioId), { sucursalId: esc.sucursalId });

    expect(resultado).toMatchObject({ tipo: 'creado', pago: { sucursalId: esc.sucursalId, monto: '20.00' } });
  });

  it('un reintento con el mismo id no duplica ni cambia lo guardado', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    const pago = nuevoPago(orden.id, esc.usuarioId);

    await pagos.crear(pago, { sucursalId: null });
    const reintento = await pagos.crear({ ...pago, monto: 9900 }, { sucursalId: null });

    expect(reintento).toMatchObject({ tipo: 'existente', pago: { monto: '20.00' } });
    expect(await pagosDe(orden.id)).toBe(1);
  });

  it('no cobra una orden ANULADA', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { estado: 'ANULADO' });

    const resultado = await pagos.crear(nuevoPago(orden.id, esc.usuarioId), { sucursalId: null });

    expect(resultado.tipo).toBe('orden-anulada');
    expect(await pagosDe(orden.id)).toBe(0);
  });

  it('con restricción de sucursal, no cobra una orden de otra', async () => {
    const esc = await escenario();
    const otraSucursal = await crearSucursal();
    const ajena = await crearOrden(esc, { sucursalId: otraSucursal });

    const resultado = await pagos.crear(nuevoPago(ajena.id, esc.usuarioId), { sucursalId: esc.sucursalId });

    expect(resultado.tipo).toBe('orden-no-encontrada');
    expect(await pagosDe(ajena.id)).toBe(0);
  });

  it('un ADMIN (sin restricción) cobra en cualquier sucursal, y el pago lleva la de la orden', async () => {
    const esc = await escenario();
    const otraSucursal = await crearSucursal();
    const ajena = await crearOrden(esc, { sucursalId: otraSucursal });

    const resultado = await pagos.crear(nuevoPago(ajena.id, esc.usuarioId), { sucursalId: null });

    expect(resultado).toMatchObject({ tipo: 'creado', pago: { sucursalId: otraSucursal } });
  });

  it('con una anulación sin confirmar, el cobro espera y al final no se guarda', async () => {
    // Es la garantía del FOR SHARE (SPEC-ALE186-005): sin él, el cobro leería la
    // orden como LISTO, no esperaría, y quedaría un pago sobre una orden anulada.
    const esc = await escenario();
    const orden = await crearOrden(esc);

    const { resultado, espero } = await mientrasSeAnula(orden.id, () =>
      pagos.crear(nuevoPago(orden.id, esc.usuarioId), { sucursalId: esc.sucursalId }),
    );

    expect(espero).toBe(true);
    expect(resultado.tipo).toBe('orden-anulada');
    expect(await pagosDe(orden.id)).toBe(0);
  });
});
