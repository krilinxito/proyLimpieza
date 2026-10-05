import { describe, expect, it } from 'vitest';
import * as estadisticas from '../../src/models/estadisticas.model.js';
import { crearEntrega, crearOrden, crearPago, crearSucursal, escenario } from '../helpers/baseReal.js';

// Contra Postgres real: lo que importa de una agregación es que SUME bien, y eso
// un doble del pool no lo puede probar (CLAUDE.md, sección 4).
//
// Para no pisarse con otros tests que corren en paralelo sobre la misma base,
// cada test filtra por su propia sucursal o usa una ventana de fechas que nadie
// más usa. "Hoy" se pasa fijo, así que días y tramos no dependen del reloj.

const HOY = '2025-06-30';

describe('Estadísticas: ingresos — SPEC-ALE186-008', () => {
  it('suma por sucursal y por método, con los cuatro métodos siempre presentes', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    await crearPago(orden, esc, { monto: '10.00', metodo: 'EFECTIVO', fechaPago: '2025-04-10T12:00:00-04:00' });
    await crearPago(orden, esc, { monto: '5.50', metodo: 'QR', fechaPago: '2025-04-11T12:00:00-04:00' });
    await crearPago(orden, esc, { monto: '4.50', metodo: 'EFECTIVO', fechaPago: '2025-04-12T12:00:00-04:00' });

    const resultado = await estadisticas.ingresos({
      desde: '2025-04-01',
      hasta: '2025-04-30',
      sucursalId: esc.sucursalId,
    });

    expect(resultado.total).toBe('20.00');
    expect(resultado.porSucursal).toEqual([
      {
        sucursalId: esc.sucursalId,
        sucursal: expect.any(String),
        total: '20.00',
        porMetodo: { EFECTIVO: '14.50', QR: '5.50', TARJETA: '0.00', TRANSFERENCIA: '0.00' },
      },
    ]);
  });

  it('suma decimales exactos: 0.10 + 0.20 da "0.30"', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    await crearPago(orden, esc, { monto: '0.10', fechaPago: '2025-04-15T12:00:00-04:00' });
    await crearPago(orden, esc, { monto: '0.20', fechaPago: '2025-04-15T13:00:00-04:00' });

    const { total } = await estadisticas.ingresos({ desde: '2025-04-15', hasta: '2025-04-15', sucursalId: esc.sucursalId });

    expect(total).toBe('0.30');
  });

  it('cuenta un cobro de las 21:00 en Bolivia en ese día, aunque en UTC ya sea el siguiente', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    // 21:00 del 6 de marzo en Bolivia = 01:00 del 7 de marzo en UTC.
    await crearPago(orden, esc, { monto: '25.00', fechaPago: '2025-03-07T01:00:00Z' });

    const del6 = await estadisticas.ingresos({ desde: '2025-03-06', hasta: '2025-03-06', sucursalId: esc.sucursalId });
    const del7 = await estadisticas.ingresos({ desde: '2025-03-07', hasta: '2025-03-07', sucursalId: esc.sucursalId });

    expect(del6.total).toBe('25.00');
    expect(del7.total).toBe('0.00');
  });

  it('sin sucursal devuelve todas las que cobraron, y el total es la suma de todas', async () => {
    // Una ventana de fechas que ningún otro test usa: acá no se filtra por sucursal.
    const [norte, sur] = await Promise.all([escenario(), escenario()]);
    const [ordenNorte, ordenSur] = await Promise.all([crearOrden(norte), crearOrden(sur)]);
    await crearPago(ordenNorte, norte, { monto: '30.00', fechaPago: '2021-05-10T12:00:00-04:00' });
    await crearPago(ordenSur, sur, { monto: '12.25', metodo: 'TARJETA', fechaPago: '2021-05-10T15:00:00-04:00' });

    const resultado = await estadisticas.ingresos({ desde: '2021-05-10', hasta: '2021-05-10', sucursalId: null });

    expect(resultado.porSucursal.map((s) => s.sucursalId).sort()).toEqual([norte.sucursalId, sur.sucursalId].sort());
    expect(resultado.total).toBe('42.25');
  });

  it('con sucursal_id, deja afuera los cobros de las demás sucursales', async () => {
    const esc = await escenario();
    const otra = await crearSucursal();
    const propia = await crearOrden(esc);
    const ajena = await crearOrden(esc, { sucursalId: otra });
    await crearPago(propia, esc, { monto: '8.00', fechaPago: '2025-04-20T12:00:00-04:00' });
    await crearPago(ajena, esc, { monto: '99.00', fechaPago: '2025-04-20T12:00:00-04:00' });

    const resultado = await estadisticas.ingresos({ desde: '2025-04-20', hasta: '2025-04-20', sucursalId: esc.sucursalId });

    expect(resultado.total).toBe('8.00');
    expect(resultado.porSucursal).toHaveLength(1);
  });

  it('sin cobros en el período, el total es "0.00" y no hay sucursales', async () => {
    const esc = await escenario();

    expect(await estadisticas.ingresos({ desde: '2025-01-01', hasta: '2025-01-31', sucursalId: esc.sucursalId })).toEqual({
      total: '0.00',
      porSucursal: [],
    });
  });
});

describe('Estadísticas: saldos pendientes — SPEC-ALE186-008', () => {
  it('lista lo que se debe, con precio_final si hubo entrega, de la más antigua a la más nueva', async () => {
    const esc = await escenario();
    const periodo = { desde: '2025-05-01', hasta: '2025-06-30', sucursalId: esc.sucursalId };

    // Debe 70: precio 100, pagó 30. Hace 40 días.
    const vieja = await crearOrden(esc, { precioTotal: '100.00', fechaEntrada: '2025-05-21T10:00:00-04:00' });
    await crearPago(vieja, esc, { monto: '30.00' });
    // Debe 30: entregada con recargo (precio 50, precio final 80), pagó 50. Hace 3 días.
    const entregada = await crearOrden(esc, { precioTotal: '50.00', fechaEntrada: '2025-06-27T10:00:00-04:00' });
    await crearPago(entregada, esc, { monto: '50.00' });
    await crearEntrega(entregada, esc, { precioFinal: '80.00' });
    // No debe nada: pagada entera.
    const pagada = await crearOrden(esc, { precioTotal: '20.00', fechaEntrada: '2025-06-01T10:00:00-04:00' });
    await crearPago(pagada, esc, { monto: '20.00' });
    // Anulada: no se cobra, aunque no tenga pagos.
    await crearOrden(esc, { estado: 'ANULADO', precioTotal: '60.00', fechaEntrada: '2025-06-01T10:00:00-04:00' });
    // Fuera del período.
    await crearOrden(esc, { precioTotal: '15.00', fechaEntrada: '2025-04-30T10:00:00-04:00' });

    const resultado = await estadisticas.saldos(periodo, HOY);

    expect(resultado.ordenes.map((o) => o.numeroBoleta)).toEqual([vieja.numeroBoleta, entregada.numeroBoleta]);
    expect(resultado.ordenes[0]).toMatchObject({
      montoACobrar: '100.00',
      totalPagado: '30.00',
      saldoPendiente: '70.00',
      fechaEntrada: '2025-05-21 10:00:00',
      dias: 40,
    });
    expect(resultado.ordenes[1]).toMatchObject({ montoACobrar: '80.00', saldoPendiente: '30.00', dias: 3 });
    expect(resultado.total).toBe('100.00');
    expect(resultado.cantidad).toBe(2);
    expect(resultado.porAntiguedad).toEqual([
      { tramo: 'HASTA_7_DIAS', cantidad: 1, total: '30.00' },
      { tramo: 'DE_8_A_30_DIAS', cantidad: 0, total: '0.00' },
      { tramo: 'MAS_DE_30_DIAS', cantidad: 1, total: '70.00' },
    ]);
  });

  it('sin deudas, devuelve los tres tramos en cero', async () => {
    const esc = await escenario();

    const resultado = await estadisticas.saldos({ desde: '2025-01-01', hasta: '2025-01-31', sucursalId: esc.sucursalId }, HOY);

    expect(resultado).toEqual({
      total: '0.00',
      cantidad: 0,
      porAntiguedad: [
        { tramo: 'HASTA_7_DIAS', cantidad: 0, total: '0.00' },
        { tramo: 'DE_8_A_30_DIAS', cantidad: 0, total: '0.00' },
        { tramo: 'MAS_DE_30_DIAS', cantidad: 0, total: '0.00' },
      ],
      ordenes: [],
    });
  });

  it('los límites de los tramos: 7 días es "hasta 7", 8 y 30 son "de 8 a 30", 31 es "más de 30"', async () => {
    const esc = await escenario();
    // HOY = 30 de junio. Días hasta hoy: 7 → 23/6, 8 → 22/6, 30 → 31/5, 31 → 30/5.
    for (const dia of ['2025-06-23', '2025-06-22', '2025-05-31', '2025-05-30']) {
      await crearOrden(esc, { precioTotal: '10.00', fechaEntrada: `${dia}T12:00:00-04:00` });
    }

    const { porAntiguedad } = await estadisticas.saldos({ desde: '2025-05-01', hasta: '2025-06-30', sucursalId: esc.sucursalId }, HOY);

    expect(porAntiguedad.map((t) => t.cantidad)).toEqual([1, 2, 1]);
  });
});

describe('Estadísticas: ropa sin recoger — SPEC-ALE186-008', () => {
  it('lista lo que sigue en el local, de la más antigua a la más nueva, sin entregadas ni anuladas', async () => {
    const esc = await escenario();
    const otra = await crearSucursal();
    const periodo = { desde: '2025-05-01', hasta: '2025-06-30', sucursalId: esc.sucursalId };

    const nueva = await crearOrden(esc, { estado: 'LISTO', fechaEntrada: '2025-06-25T09:00:00-04:00' });
    const vieja = await crearOrden(esc, { estado: 'EN_PROCESO', fechaEntrada: '2025-05-10T09:00:00-04:00' });
    const entregada = await crearOrden(esc, { fechaEntrada: '2025-06-01T09:00:00-04:00' });
    await crearEntrega(entregada, esc, { precioFinal: '45.50' });
    await crearOrden(esc, { estado: 'ANULADO', fechaEntrada: '2025-06-01T09:00:00-04:00' });
    await crearOrden(esc, { sucursalId: otra, fechaEntrada: '2025-06-01T09:00:00-04:00' });

    const resultado = await estadisticas.sinRecoger(periodo, HOY);

    expect(resultado.ordenes.map((o) => o.numeroBoleta)).toEqual([vieja.numeroBoleta, nueva.numeroBoleta]);
    expect(resultado.ordenes[0]).toMatchObject({
      precioTotal: '45.50',
      fechaEntrada: '2025-05-10 09:00:00',
      dias: 51,
      telefono: expect.any(String),
    });
    expect(resultado.cantidad).toBe(2);
    expect(resultado.porAntiguedad).toEqual([
      { tramo: 'HASTA_7_DIAS', cantidad: 1 },
      { tramo: 'DE_8_A_30_DIAS', cantidad: 0 },
      { tramo: 'MAS_DE_30_DIAS', cantidad: 1 },
    ]);
  });

  it('deja afuera las órdenes que entraron fuera del período', async () => {
    const esc = await escenario();
    await crearOrden(esc, { fechaEntrada: '2025-04-30T23:00:00-04:00' });
    const adentro = await crearOrden(esc, { fechaEntrada: '2025-05-01T00:30:00-04:00' });

    const resultado = await estadisticas.sinRecoger({ desde: '2025-05-01', hasta: '2025-05-31', sucursalId: esc.sucursalId }, HOY);

    expect(resultado.ordenes.map((o) => o.ordenId)).toEqual([adentro.id]);
  });
});
