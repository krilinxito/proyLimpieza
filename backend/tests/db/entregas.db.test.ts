import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as entregas from '../../src/models/entregas.model.js';
import { testApi } from '../helpers/api.js';
import {
  auditoriaDe,
  contar,
  crearOrden,
  crearRenglon,
  escenario,
  leerOrden,
  mientrasSeAnula,
  pagarOrden,
} from '../helpers/baseReal.js';
import { cuerpoDeEntrega } from '../helpers/entregas.js';
import { conSesion } from '../helpers/usuarios.js';

// Contra Postgres real. El test de `tests/unit/entregas.model.test.ts` comprueba
// que el UPDATE de la orden y el INSERT de la entrega van en la misma sentencia;
// este comprueba lo que eso garantiza: que pasan las dos cosas o ninguna.

/** La sesión de quien atiende en la sucursal del escenario. */
function sesionDe(esc: { usuarioId: string; sucursalId: string }) {
  return conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId });
}

function nuevaEntrega(ordenId: string, usuarioId: string, id: string = randomUUID()) {
  return {
    id,
    ordenId,
    tipoRetiro: 'CON_BOLETA',
    retiradoPorNombre: null,
    retiradoPorCarnet: null,
    usuarioEntregaId: usuarioId,
    precioFinal: null,
    fechaEntrega: null,
    motivoReembolso: null,
  } as const;
}

const entregasDe = (ordenId: string) =>
  contar('SELECT count(*) FROM entregas WHERE orden_id = $1', [ordenId]);

describe('Entregas contra la base real — SPEC-ALE186-007', () => {
  it('guarda la entrega, deja la orden ENTREGADO y sin precio final usa el precio_total', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc);

    const resultado = await entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), {
      sucursalId: esc.sucursalId,
    });

    expect(resultado).toMatchObject({
      tipo: 'creada',
      entrega: { sucursalId: esc.sucursalId, precioFinal: '45.50' },
    });
    expect((await leerOrden(orden.id)).estado).toBe('ENTREGADO');
  });

  it('un reintento con el mismo id no duplica', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    await pagarOrden(orden, esc);
    const entrega = nuevaEntrega(orden.id, esc.usuarioId);

    await entregas.crear(entrega, { sucursalId: null });
    const reintento = await entregas.crear(entrega, { sucursalId: null });

    expect(reintento.tipo).toBe('existente');
    expect(await entregasDe(orden.id)).toBe(1);
  });

  it('es atómica: un id ya usado sobre OTRA orden falla sin dejarla ENTREGADO', async () => {
    // El caso que justifica que la sentencia NO tenga ON CONFLICT DO NOTHING
    // (SPEC-ALE186-006): con él, el UPDATE de la otra orden quedaría aplicado.
    const esc = await escenario();
    const primera = await crearOrden(esc);
    const otra = await crearOrden(esc);
    await pagarOrden(primera, esc);
    await pagarOrden(otra, esc);
    const id = randomUUID();
    await entregas.crear(nuevaEntrega(primera.id, esc.usuarioId, id), { sucursalId: null });

    const resultado = await entregas.crear(nuevaEntrega(otra.id, esc.usuarioId, id), { sucursalId: null });

    // Responde con la entrega que ya existía (es un reintento por id)...
    expect(resultado).toMatchObject({ tipo: 'existente', entrega: { ordenId: primera.id } });
    // ...y la otra orden quedó exactamente como estaba.
    expect((await leerOrden(otra.id)).estado).toBe('RECIBIDO');
    expect(await entregasDe(otra.id)).toBe(0);
  });

  it('con una anulación sin confirmar, la entrega espera y termina en orden-anulada', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    await pagarOrden(orden, esc);

    const { resultado, espero } = await mientrasSeAnula(orden.id, () =>
      entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), { sucursalId: esc.sucursalId }),
    );

    expect(espero).toBe(true);
    expect(resultado.tipo).toBe('orden-anulada');
    expect(await entregasDe(orden.id)).toBe(0);
  });

  it('dos entregas simultáneas a la misma orden dejan exactamente una', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    await pagarOrden(orden, esc);

    const resultados = await Promise.all([
      entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), { sucursalId: null }),
      entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), { sucursalId: null }),
    ]);

    expect(resultados.map((r) => r.tipo).sort()).toEqual(['creada', 'orden-ya-entregada']);
    expect(await entregasDe(orden.id)).toBe(1);
  });
});

// SPEC-KRILINXI-056: la ropa solo sale con la boleta pagada por completo. La regla es una condición del mismo UPDATE que
// marca ENTREGADO, así que lo que hay que comprobar contra Postgres es que, rechazada, no se escribe NADA.
describe('Entregar solo con la boleta pagada — SPEC-KRILINXI-056', () => {
  const sinRestriccion = { sucursalId: null };

  it('con saldo pendiente no entrega: la orden no cambia, no hay entrega ni fila de auditoría', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '20.00');
    const entrega = nuevaEntrega(orden.id, esc.usuarioId);

    const resultado = await entregas.crear(entrega, sinRestriccion);

    expect(resultado).toMatchObject({ tipo: 'saldo-pendiente', saldo: '25.50', orden: { id: orden.id } });
    expect((await leerOrden(orden.id)).estado).toBe('RECIBIDO');
    expect(await entregasDe(orden.id)).toBe(0);
    expect(await auditoriaDe(entrega.id)).toEqual([]);
  });

  it('sin ningún cobro, el saldo es el precio entero', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });

    expect(await entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), sinRestriccion)).toMatchObject({
      tipo: 'saldo-pendiente',
      saldo: '45.50',
    });
  });

  it('con el pago final ya registrado (la cola lo sube antes que la entrega), entrega', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '20.00');
    await pagarOrden(orden, esc, '25.50');

    const resultado = await entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), sinRestriccion);

    expect(resultado.tipo).toBe('creada');
    expect((await leerOrden(orden.id)).estado).toBe('ENTREGADO');
  });

  it('el recargo cuenta: con un precio final mayor, lo cobrado tiene que cubrirlo', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    // Desde SPEC-KRILINXI-068 el recargo es un renglón de cargo, y el precio final se calcula con él.
    await crearRenglon(orden, { momento: 'ENTREGA', precioUnitario: '4.50', descripcion: 'Recargo por almacenamiento' });
    await pagarOrden(orden, esc);

    const sinCobrarElRecargo = await entregas.crear({ ...nuevaEntrega(orden.id, esc.usuarioId), precioFinal: 5000 }, sinRestriccion);
    expect(sinCobrarElRecargo).toMatchObject({ tipo: 'saldo-pendiente', saldo: '4.50' });

    await pagarOrden(orden, esc, '4.50');
    const cobrado = await entregas.crear({ ...nuevaEntrega(orden.id, esc.usuarioId), precioFinal: 5000 }, sinRestriccion);
    expect(cobrado).toMatchObject({ tipo: 'creada', entrega: { precioFinal: '50.00' } });
  });

  it('cobrar de más no molesta; perdonar el cobro con un precio final 0 ya no existe (SPEC-KRILINXI-068)', async () => {
    const esc = await escenario();
    const perdonada = await crearOrden(esc, { precioTotal: '45.50' });
    const conDemas = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(conDemas, esc, '50.00');

    // Al entregar solo se suma: un precio final por debajo del total no es el calculado. Para no cobrar lo que falta
    // está el reembolso (SPEC-KRILINXI-070).
    expect((await entregas.crear({ ...nuevaEntrega(perdonada.id, esc.usuarioId), precioFinal: 0 }, sinRestriccion)).tipo).toBe('precio-distinto');
    expect((await entregas.crear(nuevaEntrega(conDemas.id, esc.usuarioId), sinRestriccion)).tipo).toBe('creada');
  });

  it('un reintento de una entrega ya guardada sigue siendo "existente", no un saldo', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    await pagarOrden(orden, esc);
    const entrega = nuevaEntrega(orden.id, esc.usuarioId);
    await entregas.crear(entrega, sinRestriccion);

    expect((await entregas.crear(entrega, sinRestriccion)).tipo).toBe('existente');
  });

  it('por la API: 409 SALDO_PENDIENTE con el monto que falta, y después de cobrar entrega', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '10.00');
    const cuerpo = cuerpoDeEntrega({ orden_id: orden.id });

    const rechazada = await testApi().post('/api/entregas').set(sesionDe(esc)).send(cuerpo);
    expect(rechazada.status).toBe(409);
    expect(rechazada.body.error.codigo).toBe('SALDO_PENDIENTE');
    expect(rechazada.body.error.mensaje).toContain('Bs 35.50 sin cobrar');
    expect((await leerOrden(orden.id)).estado).toBe('RECIBIDO');

    await pagarOrden(orden, esc, '35.50');
    const aceptada = await testApi().post('/api/entregas').set(sesionDe(esc)).send(cuerpo);
    expect(aceptada.status).toBe(201);
  });
});
