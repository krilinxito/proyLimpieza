import { describe, expect, it } from 'vitest';
import * as estadisticas from '../../src/models/estadisticas.model.js';
import { testApi } from '../helpers/api.js';
import { crearCliente, crearOrden, crearPago, crearSucursal, crearUsuario, escenario } from '../helpers/baseReal.js';
import { comoAdmin } from '../helpers/usuarios.js';

// Contra Postgres real, como las demás estadísticas: lo que importa es que cuente
// y sume bien, y que el `json_agg` de las sucursales llegue con la forma de la
// respuesta. Cada test filtra por su propio cliente o por su propia sucursal,
// para no pisarse con los demás archivos de la suite.

const JULIO = { desde: '2025-07-01', hasta: '2025-07-31' };
const PRIMERA_PAGINA = { pagina: 1, porPagina: 50 };

describe('Estadísticas de clientes: qué cuenta y dónde — SPEC-ALE186-017', () => {
  it('suma las atenciones por sucursal y en total, con lo pagado exacto y sin las anuladas', async () => {
    const esc = await escenario(); // sucursal A
    const sucursalB = await crearSucursal();
    const primera = await crearOrden(esc, { fechaEntrada: '2025-07-05T10:00:00-04:00' });
    const segunda = await crearOrden(esc, { fechaEntrada: '2025-07-08T16:30:00-04:00' });
    await crearPago(primera, esc, { monto: '10.10' });
    await crearPago(segunda, esc, { monto: '0.20' });
    await crearOrden(esc, { fechaEntrada: '2025-07-12T09:00:00-04:00', sucursalId: sucursalB });
    await crearOrden(esc, { fechaEntrada: '2025-07-20T09:00:00-04:00', estado: 'ANULADO' });

    const { total, clientes } = await estadisticas.clientes({ ...JULIO, sucursalId: null }, esc.clienteId, PRIMERA_PAGINA);

    expect(total).toBe(1);
    expect(clientes).toEqual([
      {
        cliente: { id: esc.clienteId, nombre: 'Cliente de prueba', telefono: expect.any(String) },
        ordenes: 3,
        gastado: '10.30',
        // La anulada del 20 no cuenta: la última visita es la del 12.
        ultimaVisita: '2025-07-12 09:00:00',
        porSucursal: expect.arrayContaining([
          { sucursal: { id: esc.sucursalId, nombre: expect.any(String) }, ordenes: 2, gastado: '10.30', ultimaVisita: '2025-07-08 16:30:00' },
          { sucursal: { id: sucursalB, nombre: expect.any(String) }, ordenes: 1, gastado: '0.00', ultimaVisita: '2025-07-12 09:00:00' },
        ]),
      },
    ]);
    expect(clientes[0]?.porSucursal).toHaveLength(2);
  });

  it('una orden de las 21:00 en Bolivia cuenta en ese día, aunque en UTC ya sea el siguiente', async () => {
    const esc = await escenario();
    // 21:00 del 10 de julio en Bolivia = 01:00 del 11 en UTC.
    await crearOrden(esc, { fechaEntrada: '2025-07-11T01:00:00Z' });

    const del10 = await estadisticas.clientes({ desde: '2025-07-10', hasta: '2025-07-10', sucursalId: null }, esc.clienteId, PRIMERA_PAGINA);
    const del11 = await estadisticas.clientes({ desde: '2025-07-11', hasta: '2025-07-11', sucursalId: null }, esc.clienteId, PRIMERA_PAGINA);

    expect(del10.total).toBe(1);
    expect(del10.clientes[0]?.ultimaVisita).toBe('2025-07-10 21:00:00');
    expect(del11.total).toBe(0);
  });

  it('con filtro de sucursal, solo cuenta las órdenes de esa sucursal', async () => {
    const esc = await escenario();
    const sucursalB = await crearSucursal();
    await crearOrden(esc, { fechaEntrada: '2025-07-05T10:00:00-04:00' });
    await crearOrden(esc, { fechaEntrada: '2025-07-06T10:00:00-04:00', sucursalId: sucursalB });

    const { clientes } = await estadisticas.clientes({ ...JULIO, sucursalId: sucursalB }, esc.clienteId, PRIMERA_PAGINA);

    expect(clientes[0]).toMatchObject({ ordenes: 1, porSucursal: [{ sucursal: { id: sucursalB } }] });
  });
});

describe('Estadísticas de clientes: orden y páginas — SPEC-ALE186-017', () => {
  it('ordena de quien más vino a quien menos, pagina, y el total cuenta todo aunque la página esté vacía', async () => {
    const esc = await escenario(); // una sucursal propia: el filtro aísla este test
    const [dos, uno] = await Promise.all([crearCliente(), crearCliente()]);
    const con = (clienteId: string) => ({ ...esc, clienteId });
    for (const dia of ['01', '02', '03']) await crearOrden(esc, { fechaEntrada: `2025-07-${dia}T10:00:00-04:00` });
    for (const dia of ['04', '05']) await crearOrden(con(dos), { fechaEntrada: `2025-07-${dia}T10:00:00-04:00` });
    await crearOrden(con(uno), { fechaEntrada: '2025-07-06T10:00:00-04:00' });
    // Un cliente que solo tiene una orden anulada no aparece.
    await crearOrden(con(await crearCliente()), { fechaEntrada: '2025-07-07T10:00:00-04:00', estado: 'ANULADO' });
    const periodo = { ...JULIO, sucursalId: esc.sucursalId };

    const primera = await estadisticas.clientes(periodo, null, { pagina: 1, porPagina: 2 });
    const segunda = await estadisticas.clientes(periodo, null, { pagina: 2, porPagina: 2 });
    const vacia = await estadisticas.clientes(periodo, null, { pagina: 3, porPagina: 2 });

    expect(primera.total).toBe(3);
    expect(primera.clientes.map((c) => [c.cliente.id, c.ordenes])).toEqual([
      [esc.clienteId, 3],
      [dos, 2],
    ]);
    expect(segunda.clientes.map((c) => c.cliente.id)).toEqual([uno]);
    expect(vacia).toEqual({ total: 3, clientes: [] });
  });

  it('por HTTP, con el período, la página y el total', async () => {
    const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
    const esc = await escenario();
    await crearOrden(esc, { fechaEntrada: '2025-07-05T10:00:00-04:00' });

    const res = await testApi()
      .get('/api/estadisticas/clientes')
      .query({ ...JULIO, cliente_id: esc.clienteId })
      .set(admin);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...JULIO, pagina: 1, porPagina: 50, total: 1 });
    expect(res.body.clientes[0]).toMatchObject({ ordenes: 1, gastado: '0.00' });
  });
});
