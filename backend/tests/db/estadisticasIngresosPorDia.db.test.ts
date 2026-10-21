import { describe, expect, it } from 'vitest';
import * as estadisticas from '../../src/models/estadisticas.model.js';
import { testApi } from '../helpers/api.js';
import { crearOrden, crearPago, crearSucursal, crearUsuario, escenario, type Escenario } from '../helpers/baseReal.js';
import { comoAdmin } from '../helpers/usuarios.js';

// Contra Postgres real, como las demás estadísticas (SPEC-ALE186-008): lo que importa de una
// agregación es que sume bien, cuente los días en cero y ponga cada cobro en su día, y eso solo lo
// dice la base. Cada test usa su propia sucursal para no pisarse con los demás archivos de la suite,
// que corren en paralelo, y fechas de un año que ningún otro test usa.

const EN_CERO = { EFECTIVO: '0.00', QR: '0.00', TARJETA: '0.00', TRANSFERENCIA: '0.00' };

/** Un cobro de la sucursal del escenario, en la fecha dada (ISO con zona, como la manda el dispositivo). */
async function cobrar(esc: Escenario, monto: string, fechaPago: string, metodo: 'EFECTIVO' | 'QR' | 'TARJETA' | 'TRANSFERENCIA' = 'EFECTIVO') {
  const orden = await crearOrden(esc);
  await crearPago(orden, esc, { monto, metodo, fechaPago });
}

/** Centavos de un monto "125.50": para comparar sumas en el test sin pasar por floats. */
const centavos = (monto: string) => Math.round(Number(monto) * 100);

describe('Ingresos por día: todos los días y lo cobrado en cada uno — SPEC-KRILINXI-043', () => {
  it('trae un registro por cada día del período, en orden, también los que quedan en "0.00"', async () => {
    const esc = await escenario();
    await cobrar(esc, '10.00', '2024-04-02T10:00:00-04:00');
    await cobrar(esc, '5.50', '2024-04-04T10:00:00-04:00', 'QR');

    const resultado = await estadisticas.ingresosPorDia({ desde: '2024-04-01', hasta: '2024-04-05', sucursalId: esc.sucursalId });

    expect(resultado.porDia.map((d) => [d.fecha, d.total])).toEqual([
      ['2024-04-01', '0.00'],
      ['2024-04-02', '10.00'],
      ['2024-04-03', '0.00'],
      ['2024-04-04', '5.50'],
      ['2024-04-05', '0.00'],
    ]);
    expect(resultado.total).toBe('15.50');
  });

  it('desglosa cada día por forma de pago, con las cuatro siempre presentes', async () => {
    const esc = await escenario();
    await cobrar(esc, '10.00', '2024-04-10T09:00:00-04:00', 'EFECTIVO');
    await cobrar(esc, '5.50', '2024-04-10T11:00:00-04:00', 'QR');
    await cobrar(esc, '4.50', '2024-04-10T15:00:00-04:00', 'EFECTIVO');

    const { porDia } = await estadisticas.ingresosPorDia({ desde: '2024-04-10', hasta: '2024-04-11', sucursalId: esc.sucursalId });

    expect(porDia).toEqual([
      { fecha: '2024-04-10', total: '20.00', porMetodo: { ...EN_CERO, EFECTIVO: '14.50', QR: '5.50' } },
      { fecha: '2024-04-11', total: '0.00', porMetodo: EN_CERO },
    ]);
  });

  it('suma decimales exactos: 0.10 + 0.20 da "0.30", en el día y en el total', async () => {
    const esc = await escenario();
    await cobrar(esc, '0.10', '2024-04-15T12:00:00-04:00');
    await cobrar(esc, '0.20', '2024-04-15T13:00:00-04:00');

    const { total, porDia } = await estadisticas.ingresosPorDia({ desde: '2024-04-15', hasta: '2024-04-15', sucursalId: esc.sucursalId });

    expect(porDia).toEqual([{ fecha: '2024-04-15', total: '0.30', porMetodo: { ...EN_CERO, EFECTIVO: '0.30' } }]);
    expect(total).toBe('0.30');
  });

  it('un período sin ningún cobro trae todos los días en cero y el total en "0.00"', async () => {
    const esc = await escenario();

    const resultado = await estadisticas.ingresosPorDia({ desde: '2024-04-20', hasta: '2024-04-22', sucursalId: esc.sucursalId });

    expect(resultado).toEqual({
      total: '0.00',
      porDia: ['2024-04-20', '2024-04-21', '2024-04-22'].map((fecha) => ({ fecha, total: '0.00', porMetodo: EN_CERO })),
    });
  });
});

describe('Ingresos por día: el día es el de Bolivia — SPEC-KRILINXI-043', () => {
  it('un cobro de las 21:00 en Bolivia cae en ese día, aunque en UTC ya sea el siguiente', async () => {
    const esc = await escenario();
    // 21:00 del 6 de marzo en Bolivia = 01:00 del 7 en UTC.
    await cobrar(esc, '25.00', '2024-03-07T01:00:00Z');

    const { porDia } = await estadisticas.ingresosPorDia({ desde: '2024-03-06', hasta: '2024-03-07', sucursalId: esc.sucursalId });

    expect(porDia.map((d) => [d.fecha, d.total])).toEqual([
      ['2024-03-06', '25.00'],
      ['2024-03-07', '0.00'],
    ]);
  });

  it('el límite entre un día y otro es la medianoche de Bolivia: 23:59 es de hoy y 00:00 es de mañana', async () => {
    const esc = await escenario();
    await cobrar(esc, '1.00', '2024-03-10T23:59:00-04:00');
    await cobrar(esc, '2.00', '2024-03-11T00:00:00-04:00');

    const { porDia } = await estadisticas.ingresosPorDia({ desde: '2024-03-10', hasta: '2024-03-11', sucursalId: esc.sucursalId });

    expect(porDia.map((d) => [d.fecha, d.total])).toEqual([
      ['2024-03-10', '1.00'],
      ['2024-03-11', '2.00'],
    ]);
  });

  it('lo cobrado fuera del período no cuenta: ni el día de antes ni el de después', async () => {
    const esc = await escenario();
    await cobrar(esc, '9.00', '2024-03-19T23:30:00-04:00'); // el día anterior a `desde`
    await cobrar(esc, '3.00', '2024-03-20T08:00:00-04:00');
    await cobrar(esc, '9.00', '2024-03-21T00:30:00-04:00'); // el día posterior a `hasta`

    const { total, porDia } = await estadisticas.ingresosPorDia({ desde: '2024-03-20', hasta: '2024-03-20', sucursalId: esc.sucursalId });

    expect(porDia).toEqual([{ fecha: '2024-03-20', total: '3.00', porMetodo: { ...EN_CERO, EFECTIVO: '3.00' } }]);
    expect(total).toBe('3.00');
  });
});

describe('Ingresos por día: la sucursal y la coincidencia con /ingresos — SPEC-KRILINXI-043', () => {
  it('con sucursal, solo lo cobrado en esa; sin sucursal, todas las que cobraron', async () => {
    const [norte, sur] = await Promise.all([escenario(), escenario()]);
    // Una ventana de fechas que ningún otro test usa: acá, sin sucursal, se cuentan todas.
    await cobrar(norte, '30.00', '2019-08-10T12:00:00-04:00');
    await cobrar(sur, '12.25', '2019-08-10T15:00:00-04:00', 'TARJETA');

    const soloNorte = await estadisticas.ingresosPorDia({ desde: '2019-08-10', hasta: '2019-08-10', sucursalId: norte.sucursalId });
    const todas = await estadisticas.ingresosPorDia({ desde: '2019-08-10', hasta: '2019-08-10', sucursalId: null });

    expect(soloNorte.porDia[0]).toMatchObject({ total: '30.00', porMetodo: { ...EN_CERO, EFECTIVO: '30.00' } });
    expect(todas.porDia[0]).toMatchObject({ total: '42.25', porMetodo: { ...EN_CERO, EFECTIVO: '30.00', TARJETA: '12.25' } });
    expect(todas.total).toBe('42.25');
  });

  it('la suma de todos los días da lo mismo que /ingresos para el mismo período y sucursal, en total y por forma de pago', async () => {
    const esc = await escenario();
    await cobrar(esc, '10.10', '2024-05-02T09:00:00-04:00', 'EFECTIVO');
    await cobrar(esc, '0.20', '2024-05-02T21:30:00-04:00', 'QR');
    await cobrar(esc, '33.33', '2024-05-05T12:00:00-04:00', 'TARJETA');
    await cobrar(esc, '7.07', '2024-05-07T18:00:00-04:00', 'EFECTIVO');
    const periodo = { desde: '2024-05-01', hasta: '2024-05-08', sucursalId: esc.sucursalId };

    const porDia = await estadisticas.ingresosPorDia(periodo);
    const general = await estadisticas.ingresos(periodo);

    expect(porDia.total).toBe(general.total);
    // La suma, hecha acá en centavos enteros: es el test el que suma, no el model.
    const sumaDeLosDias = porDia.porDia.reduce((suma, d) => suma + centavos(d.total), 0);
    expect(sumaDeLosDias).toBe(centavos(general.total));
    const sucursal = general.porSucursal[0];
    for (const metodo of ['EFECTIVO', 'QR', 'TARJETA', 'TRANSFERENCIA'] as const) {
      const delMetodo = porDia.porDia.reduce((suma, d) => suma + centavos(d.porMetodo[metodo]), 0);
      expect(delMetodo).toBe(centavos(sucursal?.porMetodo[metodo] ?? '0.00'));
    }
  });

  it('por HTTP: el ADMIN lo pide con las mismas fechas y sucursal que las demás estadísticas', async () => {
    const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
    const esc = await escenario();
    await cobrar(esc, '18.00', '2024-06-03T10:00:00-04:00', 'QR');

    const res = await testApi()
      .get('/api/estadisticas/ingresos-por-dia')
      .query({ desde: '2024-06-02', hasta: '2024-06-04', sucursal_id: esc.sucursalId })
      .set(admin);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      desde: '2024-06-02',
      hasta: '2024-06-04',
      total: '18.00',
      porDia: [
        { fecha: '2024-06-02', total: '0.00', porMetodo: EN_CERO },
        { fecha: '2024-06-03', total: '18.00', porMetodo: { ...EN_CERO, QR: '18.00' } },
        { fecha: '2024-06-04', total: '0.00', porMetodo: EN_CERO },
      ],
    });
  });

  it('una sucursal sin cobros en el período no ensucia la de al lado', async () => {
    const vacia = await crearSucursal();
    const otra = await escenario();
    await cobrar(otra, '50.00', '2024-06-10T12:00:00-04:00');

    const { total } = await estadisticas.ingresosPorDia({ desde: '2024-06-10', hasta: '2024-06-10', sucursalId: vacia });

    expect(total).toBe('0.00');
  });
});
