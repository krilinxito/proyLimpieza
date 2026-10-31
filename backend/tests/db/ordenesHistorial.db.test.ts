import { describe, expect, it } from 'vitest';
import { testApi } from '../helpers/api.js';
import {
  crearCliente,
  crearEntrega,
  crearOrden,
  crearPago,
  escenario,
  type Escenario,
} from '../helpers/baseReal.js';
import { comoAdmin } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4). El historial calcula el saldo con `vw_saldos`
// y filtra con SQL: que sume bien, que no duplique filas al cruzar pagos y
// entregas y que los filtros se combinen solo lo puede decir Postgres.
//
// La base de pruebas es compartida con toda la suite, así que cada test filtra
// por su propia sucursal recién creada y nunca cuenta "todo lo que hay".

interface Pagina {
  total: number;
  pagina: number;
  porPagina: number;
  desde: string | null;
  hasta: string | null;
  boletas: {
    id: string;
    numeroBoleta: string;
    estado: string;
    fechaEntrada: string;
    precioTotal: string;
    precioFinal: string | null;
    retiro: { tipo: string; nombre: string | null; carnet: string | null } | null;
    pagado: string;
    saldo: string;
    sucursal: { id: string; nombre: string };
    cliente: { id: string; nombre: string; telefono: string };
  }[];
}

async function historial(esc: Escenario, query: Record<string, string> = {}): Promise<Pagina> {
  const res = await testApi()
    .get('/api/ordenes')
    .query({ sucursal_id: esc.sucursalId, ...query })
    .set(comoAdmin());
  expect(res.status).toBe(200);
  return res.body as Pagina;
}

const ids = (pagina: Pagina) => pagina.boletas.map((b) => b.id);

describe('Historial de boletas: el saldo se calcula en Postgres — SPEC-KRILINXI-040', () => {
  it('suma los pagos sin dejar que cruzar con entregas duplique filas ni montos', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { estado: 'RECIBIDO', precioTotal: '45.50' });
    await crearPago(orden, esc, { monto: '10.00' });
    await crearPago(orden, esc, { monto: '5.25' });

    const { boletas, total } = await historial(esc);

    expect(total).toBe(1);
    expect(boletas).toHaveLength(1);
    expect(boletas[0]).toMatchObject({
      id: orden.id,
      numeroBoleta: orden.numeroBoleta,
      estado: 'RECIBIDO',
      precioTotal: '45.50',
      precioFinal: null,
      pagado: '15.25',
      saldo: '30.25',
    });
  });

  it('una boleta sin ningún pago debe todo su precio', async () => {
    const esc = await escenario();
    await crearOrden(esc, { precioTotal: '12.00' });

    const { boletas } = await historial(esc);

    expect(boletas[0]).toMatchObject({ pagado: '0.00', saldo: '12.00' });
  });

  it('una boleta entregada es ENTREGADO y su saldo cuenta con el precio final, no con el total', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { estado: 'RECIBIDO', precioTotal: '45.50' });
    await crearPago(orden, esc, { monto: '15.25' });
    await crearEntrega(orden, esc, { precioFinal: '50.00' });

    const { boletas } = await historial(esc);

    expect(boletas[0]).toMatchObject({
      estado: 'ENTREGADO',
      precioTotal: '45.50',
      precioFinal: '50.00',
      pagado: '15.25',
      saldo: '34.75',
    });
  });

  it('trae la sucursal y el cliente de cada boleta, con sus nombres', async () => {
    const esc = await escenario();
    const clienteId = await crearCliente({ nombre: 'Rosa Quispe', telefono: '70123456' });
    await crearOrden({ ...esc, clienteId });

    const { boletas } = await historial(esc);

    expect(boletas[0]?.sucursal).toEqual({ id: esc.sucursalId, nombre: expect.any(String) });
    expect(boletas[0]?.cliente).toEqual({ id: clienteId, nombre: 'Rosa Quispe', telefono: '70123456' });
  });
});

describe('Historial de boletas: quién retiró la ropa — SPEC-KRILINXI-060', () => {
  it('una boleta entregada sin boleta trae el nombre y el carnet de quien retiró', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { estado: 'RECIBIDO', precioTotal: '20.00' });
    await crearPago(orden, esc, { monto: '20.00' });
    await crearEntrega(orden, esc, { precioFinal: '20.00', sinBoleta: { nombre: 'Luis Mamani', carnet: '1234567 LP' } });

    const { boletas } = await historial(esc);

    expect(boletas[0]?.retiro).toEqual({ tipo: 'SIN_BOLETA', nombre: 'Luis Mamani', carnet: '1234567 LP' });
  });

  it('una entregada con boleta dice solo el tipo', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { estado: 'RECIBIDO', precioTotal: '20.00' });
    await crearEntrega(orden, esc, { precioFinal: '20.00' });

    const { boletas } = await historial(esc);

    expect(boletas[0]?.retiro).toEqual({ tipo: 'CON_BOLETA', nombre: null, carnet: null });
  });

  it('una boleta sin entregar no trae retiro', async () => {
    const esc = await escenario();
    await crearOrden(esc, { estado: 'RECIBIDO' });

    const { boletas } = await historial(esc);

    expect(boletas[0]?.retiro).toBeNull();
  });
});

describe('Historial de boletas: fechas — SPEC-KRILINXI-040', () => {
  it('sin `desde` trae todo el historial, también lo de hace años, de la más nueva a la más vieja', async () => {
    const esc = await escenario();
    const vieja = await crearOrden(esc, { fechaEntrada: '2019-03-10T12:00:00-04:00' });
    const reciente = await crearOrden(esc, { fechaEntrada: '2026-09-30T12:00:00-04:00' });
    const media = await crearOrden(esc, { fechaEntrada: '2023-01-05T12:00:00-04:00' });

    const pagina = await historial(esc);

    expect(ids(pagina)).toEqual([reciente.id, media.id, vieja.id]);
    expect(pagina.desde).toBeNull();
    expect(pagina.hasta).toBeNull();
  });

  it('muestra la fecha de entrada en la hora de Bolivia', async () => {
    const esc = await escenario();
    // 21:00 en Bolivia = 01:00 del día siguiente en UTC.
    await crearOrden(esc, { fechaEntrada: '2026-03-07T01:00:00Z' });

    const { boletas } = await historial(esc);

    expect(boletas[0]?.fechaEntrada).toBe('2026-03-06 21:00:00');
  });

  it('una boleta de las 21:00 en Bolivia cuenta en ese día aunque en UTC ya sea el siguiente', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { fechaEntrada: '2026-03-07T01:00:00Z' });

    const del6 = await historial(esc, { desde: '2026-03-06', hasta: '2026-03-06' });
    const del7 = await historial(esc, { desde: '2026-03-07', hasta: '2026-03-07' });

    expect(ids(del6)).toEqual([orden.id]);
    expect(del7.total).toBe(0);
  });

  it('con solo `desde` no pone tope de arriba, y con solo `hasta` no pone tope de abajo', async () => {
    const esc = await escenario();
    const vieja = await crearOrden(esc, { fechaEntrada: '2020-05-10T12:00:00-04:00' });
    const nueva = await crearOrden(esc, { fechaEntrada: '2026-05-10T12:00:00-04:00' });

    const desdeMedio = await historial(esc, { desde: '2023-01-01' });
    const hastaMedio = await historial(esc, { hasta: '2023-01-01' });

    expect(ids(desdeMedio)).toEqual([nueva.id]);
    expect(ids(hastaMedio)).toEqual([vieja.id]);
  });

  it('`desde` y `hasta` incluyen sus propios días', async () => {
    const esc = await escenario();
    const primero = await crearOrden(esc, { fechaEntrada: '2026-04-01T08:00:00-04:00' });
    const ultimo = await crearOrden(esc, { fechaEntrada: '2026-04-30T23:30:00-04:00' });
    await crearOrden(esc, { fechaEntrada: '2026-03-31T23:30:00-04:00' });
    await crearOrden(esc, { fechaEntrada: '2026-05-01T00:30:00-04:00' });

    const abril = await historial(esc, { desde: '2026-04-01', hasta: '2026-04-30' });

    expect(ids(abril)).toEqual([ultimo.id, primero.id]);
  });
});

describe('Historial de boletas: filtros — SPEC-KRILINXI-040', () => {
  it('filtra por sucursal: no se mezclan las boletas de otra', async () => {
    const esc = await escenario();
    const otra = await escenario();
    const mia = await crearOrden(esc);
    await crearOrden(otra);

    const pagina = await historial(esc);

    expect(ids(pagina)).toEqual([mia.id]);
  });

  it('filtra por estado', async () => {
    const esc = await escenario();
    const recibida = await crearOrden(esc, { estado: 'RECIBIDO' });
    const anulada = await crearOrden(esc, { estado: 'ANULADO' });
    const entregada = await crearOrden(esc, { estado: 'RECIBIDO' });
    await crearEntrega(entregada, esc, { precioFinal: '45.50' });

    expect(ids(await historial(esc, { estado: 'RECIBIDO' }))).toEqual([recibida.id]);
    expect(ids(await historial(esc, { estado: 'ANULADO' }))).toEqual([anulada.id]);
    expect(ids(await historial(esc, { estado: 'ENTREGADO' }))).toEqual([entregada.id]);
  });

  it('el texto encuentra por parte del número de boleta, sin distinguir mayúsculas', async () => {
    const esc = await escenario();
    const buscada = await crearOrden(esc);
    await crearOrden(esc);

    const pagina = await historial(esc, { texto: buscada.numeroBoleta.slice(2, 8).toLowerCase() });

    expect(ids(pagina)).toEqual([buscada.id]);
  });

  it('el texto encuentra por parte del nombre del cliente', async () => {
    const esc = await escenario();
    const rosa = await crearCliente({ nombre: 'Rosa Quispe Mamani' });
    const deRosa = await crearOrden({ ...esc, clienteId: rosa });
    await crearOrden(esc); // "Cliente de prueba"

    expect(ids(await historial(esc, { texto: 'quispe' }))).toEqual([deRosa.id]);
  });

  it('el texto encuentra por parte del teléfono, aunque se escriba con guion', async () => {
    const esc = await escenario();
    const cliente = await crearCliente({ telefono: '71234567' });
    const buscada = await crearOrden({ ...esc, clienteId: cliente });
    await crearOrden(esc);

    expect(ids(await historial(esc, { texto: '7123' }))).toEqual([buscada.id]);
    expect(ids(await historial(esc, { texto: '7123-45' }))).toEqual([buscada.id]);
  });

  it('un `%` o un `_` escritos en el texto no son comodines', async () => {
    const esc = await escenario();
    await crearOrden(esc);

    expect((await historial(esc, { texto: '%' })).total).toBe(0);
    expect((await historial(esc, { texto: '_' })).total).toBe(0);
  });

  it('con_saldo deja solo las que se deben: ni las pagadas del todo ni las anuladas', async () => {
    const esc = await escenario();
    const debe = await crearOrden(esc, { precioTotal: '40.00' });
    await crearPago(debe, esc, { monto: '10.00' });
    const pagada = await crearOrden(esc, { precioTotal: '20.00' });
    await crearPago(pagada, esc, { monto: '20.00' });
    const anulada = await crearOrden(esc, { estado: 'ANULADO', precioTotal: '30.00' });
    await crearPago(anulada, esc, { monto: '5.00' });
    // Entregada con recargo: el precio final es más que lo pagado, así que sigue debiendo.
    const entregada = await crearOrden(esc, { precioTotal: '20.00' });
    await crearPago(entregada, esc, { monto: '20.00' });
    await crearEntrega(entregada, esc, { precioFinal: '25.00' });

    const pagina = await historial(esc, { con_saldo: 'true' });

    expect(new Set(ids(pagina))).toEqual(new Set([debe.id, entregada.id]));
    expect(pagina.total).toBe(2);
    expect((await historial(esc)).total).toBe(4);
  });

  it('los filtros se combinan: todos tienen que cumplirse a la vez', async () => {
    const esc = await escenario();
    const rosa = await crearCliente({ nombre: 'Rosa Combinada' });
    const justa = await crearOrden(
      { ...esc, clienteId: rosa },
      { estado: 'RECIBIDO', fechaEntrada: '2026-06-15T12:00:00-04:00', precioTotal: '40.00' },
    );
    // Cada una incumple UNA condición.
    await crearOrden({ ...esc, clienteId: rosa }, { estado: 'ANULADO', fechaEntrada: '2026-06-15T12:00:00-04:00' });
    await crearOrden({ ...esc, clienteId: rosa }, { estado: 'RECIBIDO', fechaEntrada: '2026-08-15T12:00:00-04:00' });
    await crearOrden(esc, { estado: 'RECIBIDO', fechaEntrada: '2026-06-15T12:00:00-04:00' });
    const pagadaDelTodo = await crearOrden(
      { ...esc, clienteId: rosa },
      { estado: 'RECIBIDO', fechaEntrada: '2026-06-15T12:00:00-04:00', precioTotal: '10.00' },
    );
    await crearPago(pagadaDelTodo, esc, { monto: '10.00' });

    const pagina = await historial(esc, {
      desde: '2026-06-01',
      hasta: '2026-06-30',
      estado: 'RECIBIDO',
      texto: 'combinada',
      con_saldo: 'true',
    });

    expect(ids(pagina)).toEqual([justa.id]);
    expect(pagina.total).toBe(1);
  });
});

describe('Historial de boletas: páginas — SPEC-KRILINXI-040', () => {
  it('reparte las boletas en páginas sin repetir ni saltear ninguna, y el total es el de todas', async () => {
    const esc = await escenario();
    const creadas = [];
    for (let dia = 1; dia <= 5; dia++) {
      creadas.push(await crearOrden(esc, { fechaEntrada: `2026-02-0${dia}T12:00:00-04:00` }));
    }
    const nuevaAVieja = [...creadas].reverse().map((o) => o.id);

    const primera = await historial(esc, { por_pagina: '2', pagina: '1' });
    const segunda = await historial(esc, { por_pagina: '2', pagina: '2' });
    const tercera = await historial(esc, { por_pagina: '2', pagina: '3' });

    expect([primera.total, segunda.total, tercera.total]).toEqual([5, 5, 5]);
    expect([...ids(primera), ...ids(segunda), ...ids(tercera)]).toEqual(nuevaAVieja);
    expect(tercera).toMatchObject({ pagina: 3, porPagina: 2 });
  });

  it('una página más allá de la última viene vacía, pero con el total real', async () => {
    const esc = await escenario();
    await crearOrden(esc);
    await crearOrden(esc);

    const pagina = await historial(esc, { por_pagina: '10', pagina: '9' });

    expect(pagina.boletas).toEqual([]);
    expect(pagina.total).toBe(2);
  });
});
