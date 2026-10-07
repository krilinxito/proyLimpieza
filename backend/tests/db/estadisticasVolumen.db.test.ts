import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';
import * as estadisticas from '../../src/models/estadisticas.model.js';
import { hoyEnElNegocio } from '../../src/utils/periodo.js';
import { testApi } from '../helpers/api.js';
import { crearEntrega, crearOrden, crearPago, crearSucursal, crearUsuario, escenario } from '../helpers/baseReal.js';
import { comoAdmin } from '../helpers/usuarios.js';

// Contra Postgres real, como las demás estadísticas (SPEC-ALE186-008): lo que
// importa de una agregación es que cuente y sume bien, y eso solo lo dice la base.
//
// Cada test usa su propia sucursal (o filtra por su propio empleado) para no
// pisarse con los demás archivos de la suite, que corren en paralelo.

describe('Estadísticas: volumen de órdenes — SPEC-ALE186-013', () => {
  it('trae todos los días del período, con 0 los que no tuvieron órdenes', async () => {
    const esc = await escenario();
    await crearOrden(esc, { fechaEntrada: '2025-05-02T10:00:00-04:00' });
    await crearOrden(esc, { fechaEntrada: '2025-05-02T16:00:00-04:00' });
    await crearOrden(esc, { fechaEntrada: '2025-05-04T10:00:00-04:00' });

    const resultado = await estadisticas.volumen({ desde: '2025-05-01', hasta: '2025-05-04', sucursalId: esc.sucursalId });

    expect(resultado).toEqual({
      total: 3,
      anuladas: 0,
      porDia: [
        { fecha: '2025-05-01', ordenes: 0, anuladas: 0 },
        { fecha: '2025-05-02', ordenes: 2, anuladas: 0 },
        { fecha: '2025-05-03', ordenes: 0, anuladas: 0 },
        { fecha: '2025-05-04', ordenes: 1, anuladas: 0 },
      ],
    });
  });

  it('cuenta una orden de las 21:00 en Bolivia en ese día, aunque en UTC ya sea el siguiente', async () => {
    const esc = await escenario();
    // 21:00 del 6 de mayo en Bolivia = 01:00 del 7 en UTC.
    await crearOrden(esc, { fechaEntrada: '2025-05-07T01:00:00Z' });

    const { porDia } = await estadisticas.volumen({ desde: '2025-05-06', hasta: '2025-05-07', sucursalId: esc.sucursalId });

    expect(porDia).toEqual([
      { fecha: '2025-05-06', ordenes: 1, anuladas: 0 },
      { fecha: '2025-05-07', ordenes: 0, anuladas: 0 },
    ]);
  });

  it('cuenta las anuladas en su día y además aparte, sin descontarlas', async () => {
    const esc = await escenario();
    await crearOrden(esc, { fechaEntrada: '2025-05-10T10:00:00-04:00' });
    await crearOrden(esc, { fechaEntrada: '2025-05-10T11:00:00-04:00', estado: 'ANULADO' });

    const resultado = await estadisticas.volumen({ desde: '2025-05-10', hasta: '2025-05-10', sucursalId: esc.sucursalId });

    expect(resultado).toEqual({ total: 2, anuladas: 1, porDia: [{ fecha: '2025-05-10', ordenes: 2, anuladas: 1 }] });
  });

  it('por HTTP, con la misma lectura del período que las demás estadísticas', async () => {
    const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
    const esc = await escenario();

    const res = await testApi()
      .get('/api/estadisticas/volumen')
      .query({ desde: '2025-05-01', hasta: '2025-05-03', sucursal_id: esc.sucursalId })
      .set(admin);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ desde: '2025-05-01', hasta: '2025-05-03', total: 0, anuladas: 0 });
    expect(res.body.porDia).toHaveLength(3);
  });
});

describe('Estadísticas: productividad — SPEC-ALE186-013', () => {
  it('cuenta órdenes, cobros con su monto exacto y entregas de cada persona', async () => {
    const esc = await escenario();
    const hoy = hoyEnElNegocio();
    const orden = await crearOrden(esc);
    await crearOrden(esc);
    await crearPago(orden, esc, { monto: '10.10' });
    await crearPago(orden, esc, { monto: '0.20' });
    await crearEntrega(orden, esc, { precioFinal: '45.50' });

    const filas = await estadisticas.productividad({ desde: hoy, hasta: hoy, sucursalId: esc.sucursalId });

    expect(filas).toEqual([
      {
        usuario: { id: esc.usuarioId, nombreCompleto: 'Usuario de prueba' },
        sucursal: { id: esc.sucursalId, nombre: expect.any(String) },
        ordenesRecibidas: 2,
        cobros: 2,
        montoCobrado: '10.30',
        entregas: 1,
      },
    ]);
  });

  it('a un empleado movido de A a B le corresponde una fila por sucursal, no todo en B', async () => {
    const esc = await escenario(); // sucursal A
    const sucursalB = await crearSucursal();
    const hoy = hoyEnElNegocio();
    // Lo que hizo en A, y lo que hizo después en B: mismo empleado, otra sucursal.
    const enA = await crearOrden(esc);
    await crearPago(enA, esc, { monto: '5.00' });
    // El traslado de verdad: si la consulta agrupara por la sucursal de la
    // persona HOY, todo saldría en B y este test fallaría.
    await pool.query('UPDATE usuarios SET sucursal_id = $1 WHERE id = $2', [sucursalB, esc.usuarioId]);
    await crearOrden(esc, { sucursalId: sucursalB });

    const filas = await estadisticas.productividad({ desde: hoy, hasta: hoy, sucursalId: null });
    const suyas = filas.filter((fila) => fila.usuario.id === esc.usuarioId);

    expect(suyas.map(({ sucursal, ordenesRecibidas, cobros, montoCobrado }) => ({
      sucursal: sucursal.id,
      ordenesRecibidas,
      cobros,
      montoCobrado,
    }))).toEqual(
      expect.arrayContaining([
        { sucursal: esc.sucursalId, ordenesRecibidas: 1, cobros: 1, montoCobrado: '5.00' },
        { sucursal: sucursalB, ordenesRecibidas: 1, cobros: 0, montoCobrado: '0.00' },
      ]),
    );
    expect(suyas).toHaveLength(2);
  });

  it('quien no hizo nada en el período no aparece', async () => {
    const esc = await escenario();
    await crearOrden(esc, { fechaEntrada: '2025-05-20T10:00:00-04:00' });

    expect(await estadisticas.productividad({ desde: '2025-05-21', hasta: '2025-05-31', sucursalId: esc.sucursalId })).toEqual([]);
  });

  it('por HTTP, solo para el ADMIN', async () => {
    const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
    const esc = await escenario();
    await crearOrden(esc);

    const res = await testApi().get('/api/estadisticas/productividad').query({ sucursal_id: esc.sucursalId }).set(admin);

    expect(res.status).toBe(200);
    expect(res.body.porEmpleado).toMatchObject([{ usuario: { id: esc.usuarioId }, ordenesRecibidas: 1 }]);
  });
});
