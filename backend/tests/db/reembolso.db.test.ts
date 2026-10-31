import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';
import * as entregas from '../../src/models/entregas.model.js';
import * as estadisticas from '../../src/models/estadisticas.model.js';
import * as ordenes from '../../src/models/ordenes.model.js';
import { testApi } from '../helpers/api.js';
import { auditoriaDe, contar, crearOrden, escenario, leerOrden, pagarOrden } from '../helpers/baseReal.js';
import { cuerpoDeEntrega } from '../helpers/entregas.js';
import { comoAdmin, conSesion } from '../helpers/usuarios.js';

// Contra Postgres real — SPEC-KRILINXI-070. Entregar sin cobrar es UNA sentencia: la entrega con su motivo, la orden en
// REEMBOLSADO, el precio final igual a lo ya cobrado y la fila de auditoría marcada. Lo que hay que comprobar acá es lo
// que solo Postgres garantiza: que sea atómica, que el saldo quede en 0 de verdad y que los ingresos no cambien.

const MOTIVO = 'El cliente reclamó por una mancha y no quiso pagar el saldo.';
const sinRestriccion = { sucursalId: null };

function reembolso(ordenId: string, usuarioId: string, id: string = randomUUID()) {
  return {
    id,
    ordenId,
    tipoRetiro: 'CON_BOLETA',
    retiradoPorNombre: null,
    retiradoPorCarnet: null,
    usuarioEntregaId: usuarioId,
    precioFinal: null,
    fechaEntrega: null,
    motivoReembolso: MOTIVO,
  } as const;
}

async function filaDeEntrega(ordenId: string) {
  const { rows } = await pool.query<{ precio_final: string; motivo_reembolso: string | null }>(
    'SELECT precio_final, motivo_reembolso FROM entregas WHERE orden_id = $1',
    [ordenId],
  );
  return rows[0];
}

async function saldoEnLaVista(ordenId: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ saldo_pendiente: string }>(
    'SELECT saldo_pendiente::text FROM vw_saldos WHERE orden_id = $1',
    [ordenId],
  );
  return rows[0]?.saldo_pendiente;
}

describe('Entregar sin cobrar contra la base real — SPEC-KRILINXI-070', () => {
  it('con saldo pendiente: no responde SALDO_PENDIENTE, deja la orden REEMBOLSADO y el precio final es lo ya cobrado', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '20.00');

    const resultado = await entregas.crear(reembolso(orden.id, esc.usuarioId), sinRestriccion, 'reembolso');

    expect(resultado).toMatchObject({
      tipo: 'creada',
      entrega: { precioFinal: '20.00', motivoReembolso: MOTIVO, usuarioEntregaId: esc.usuarioId },
    });
    expect((await leerOrden(orden.id)).estado).toBe('REEMBOLSADO');
    expect(await filaDeEntrega(orden.id)).toMatchObject({ precio_final: '20.00', motivo_reembolso: MOTIVO });
  });

  it('el saldo queda en 0 sin tocar vw_saldos, y lo no cobrado se ve comparando con el precio_total', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '20.00');
    expect(await saldoEnLaVista(orden.id)).toBe('25.50');

    await entregas.crear(reembolso(orden.id, esc.usuarioId), sinRestriccion, 'reembolso');

    expect(await saldoEnLaVista(orden.id)).toBe('0.00');
    const { rows } = await pool.query<{ no_cobrado: string }>(
      `SELECT (o.precio_total - e.precio_final)::text AS no_cobrado
         FROM ordenes o JOIN entregas e ON e.orden_id = o.id WHERE o.id = $1`,
      [orden.id],
    );
    expect(rows[0]?.no_cobrado).toBe('25.50');
  });

  it('sin ningún cobro también vale: el precio final es 0 y el saldo, 0', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });

    const resultado = await entregas.crear(reembolso(orden.id, esc.usuarioId), sinRestriccion, 'reembolso');

    expect(resultado).toMatchObject({ tipo: 'creada', entrega: { precioFinal: '0.00' } });
    expect(await saldoEnLaVista(orden.id)).toBe('0.00');
  });

  it('no suma ningún ingreso ni deja deuda en las estadísticas', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '20.00');
    const periodo = { desde: '2000-01-01', hasta: '2099-12-31', sucursalId: esc.sucursalId };
    const ingresosAntes = await estadisticas.ingresos(periodo);
    const saldosAntes = await estadisticas.saldos(periodo, '2026-10-31');
    expect(saldosAntes.ordenes.map((o) => o.ordenId)).toContain(orden.id);

    await entregas.crear(reembolso(orden.id, esc.usuarioId), sinRestriccion, 'reembolso');

    // Los ingresos son los pagos: el reembolso no escribe ninguno, así que no cambian.
    expect(await estadisticas.ingresos(periodo)).toEqual(ingresosAntes);
    expect(ingresosAntes.total).toBe('20.00');
    // Y ya no figura entre lo que se debe.
    const saldosDespues = await estadisticas.saldos(periodo, '2026-10-31');
    expect(saldosDespues.ordenes.map((o) => o.ordenId)).not.toContain(orden.id);
    expect(saldosDespues.total).toBe('0.00');
  });

  it('no escribe ningún pago', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    await pagarOrden(orden, esc, '10.00');

    await entregas.crear(reembolso(orden.id, esc.usuarioId), sinRestriccion, 'reembolso');

    expect(await contar('SELECT count(*) FROM pagos WHERE orden_id = $1', [orden.id])).toBe(1);
  });

  it('un reintento con el mismo id no duplica la entrega ni la auditoría', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    const entrega = reembolso(orden.id, esc.usuarioId);

    await entregas.crear(entrega, sinRestriccion, 'reembolso');
    const reintento = await entregas.crear(entrega, sinRestriccion, 'reembolso');

    expect(reintento.tipo).toBe('existente');
    expect(await contar('SELECT count(*) FROM entregas WHERE orden_id = $1', [orden.id])).toBe(1);
    expect(await auditoriaDe(entrega.id)).toHaveLength(1);
  });

  it('una orden anulada, ya entregada o ya reembolsada rechaza el reembolso y no escribe nada', async () => {
    const esc = await escenario();
    const anulada = await crearOrden(esc, { estado: 'ANULADO' });
    const entregada = await crearOrden(esc);
    await pagarOrden(entregada, esc);
    await entregas.crear({ ...reembolso(entregada.id, esc.usuarioId), motivoReembolso: null }, sinRestriccion);
    const reembolsada = await crearOrden(esc);
    await entregas.crear(reembolso(reembolsada.id, esc.usuarioId), sinRestriccion, 'reembolso');

    const intento = async (ordenId: string) => {
      const nueva = reembolso(ordenId, esc.usuarioId);
      const resultado = await entregas.crear(nueva, sinRestriccion, 'reembolso');
      return { resultado, auditoria: await auditoriaDe(nueva.id) };
    };

    expect(await intento(anulada.id)).toMatchObject({ resultado: { tipo: 'orden-anulada' }, auditoria: [] });
    expect(await intento(entregada.id)).toMatchObject({ resultado: { tipo: 'orden-ya-entregada' }, auditoria: [] });
    expect(await intento(reembolsada.id)).toMatchObject({ resultado: { tipo: 'orden-ya-entregada' }, auditoria: [] });
    expect((await leerOrden(anulada.id)).estado).toBe('ANULADO');
    expect((await leerOrden(entregada.id)).estado).toBe('ENTREGADO');
  });

  it('un EMPLEADO no reembolsa la ropa de otra sucursal', async () => {
    const esc = await escenario();
    const otra = await escenario();
    const orden = await crearOrden(otra);

    const resultado = await entregas.crear(
      reembolso(orden.id, esc.usuarioId),
      { sucursalId: esc.sucursalId },
      'reembolso',
    );

    expect(resultado.tipo).toBe('orden-no-encontrada');
    expect((await leerOrden(orden.id)).estado).toBe('RECIBIDO');
  });

  it('la entrega común sigue exigiendo la boleta pagada y su precio', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '20.00');

    const comun = { ...reembolso(orden.id, esc.usuarioId), motivoReembolso: null };
    expect(await entregas.crear(comun, sinRestriccion)).toMatchObject({ tipo: 'saldo-pendiente', saldo: '25.50' });
    expect(await entregas.crear({ ...comun, precioFinal: 1000 }, sinRestriccion)).toMatchObject({
      tipo: 'precio-distinto',
    });
    expect((await leerOrden(orden.id)).estado).toBe('RECIBIDO');
  });

  it('con un reembolso, el precio que mande la tablet no se compara con nada', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '20.00');

    const resultado = await entregas.crear(
      { ...reembolso(orden.id, esc.usuarioId), precioFinal: 99900 },
      sinRestriccion,
      'reembolso',
    );

    expect(resultado).toMatchObject({ tipo: 'creada', entrega: { precioFinal: '20.00' } });
  });

  it('la base no deja un motivo en blanco', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    await expect(
      entregas.crear({ ...reembolso(orden.id, esc.usuarioId), motivoReembolso: '   ' }, sinRestriccion),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chk_entregas_motivo_reembolso' });
    // Falló la sentencia entera: la orden no cambió.
    expect((await leerOrden(orden.id)).estado).toBe('RECIBIDO');
  });
});

describe('Entregar sin cobrar: auditoría e historial — SPEC-KRILINXI-070', () => {
  it('la fila de auditoría es de quien lo hizo, queda marcada "reembolso" y el admin la ve con su motivo', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    const entrega = cuerpoDeEntrega({ orden_id: orden.id, motivo_reembolso: MOTIVO });
    const empleado = conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId });

    const alta = await testApi().post('/api/entregas').set(empleado).send(entrega);
    expect(alta.status).toBe(201);
    expect(alta.body).toMatchObject({ motivoReembolso: MOTIVO, usuarioEntregaId: esc.usuarioId });

    const { rows } = await pool.query<{ usuario_id: string; accion: string; revision: string | null }>(
      'SELECT usuario_id, accion, revision FROM auditoria WHERE registro_id = $1',
      [entrega.id],
    );
    expect(rows).toEqual([{ usuario_id: esc.usuarioId, accion: 'ENTREGAR', revision: 'reembolso' }]);

    const consulta = await testApi()
      .get('/api/auditoria')
      .query({ registro_id: String(entrega.id), revisar: 'true' })
      .set(comoAdmin());
    expect(consulta.status).toBe(200);
    expect(consulta.body.registros).toMatchObject([
      { accion: 'ENTREGAR', tablaAfectada: 'entregas', revision: 'reembolso', motivoReembolso: MOTIVO },
    ]);
  });

  it('una entrega común no queda marcada ni trae motivo', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    await pagarOrden(orden, esc);
    const entrega = cuerpoDeEntrega({ orden_id: orden.id });

    await testApi()
      .post('/api/entregas')
      .set(conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId }))
      .send(entrega);

    const consulta = await testApi()
      .get('/api/auditoria')
      .query({ registro_id: String(entrega.id) })
      .set(comoAdmin());
    expect(consulta.body.registros).toMatchObject([{ accion: 'ENTREGAR', revision: null, motivoReembolso: null }]);
  });

  it('el reembolso con motivo en blanco responde 400 y no escribe nada', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    const res = await testApi()
      .post('/api/entregas')
      .set(conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId }))
      .send(cuerpoDeEntrega({ orden_id: orden.id, motivo_reembolso: '  ' }));

    expect(res.status).toBe(400);
    expect((await leerOrden(orden.id)).estado).toBe('RECIBIDO');
  });

  it('GET /api/ordenes trae el reembolso de la boleta: motivo, quién y cuándo', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '20.00');
    await entregas.crear(reembolso(orden.id, esc.usuarioId), sinRestriccion, 'reembolso');

    const { boletas } = await ordenes.listar(
      { desde: null, hasta: null, sucursalId: esc.sucursalId, estado: 'REEMBOLSADO', texto: null, conSaldo: false },
      { pagina: 1, porPagina: 10 },
    );

    expect(boletas).toHaveLength(1);
    expect(boletas[0]).toMatchObject({
      id: orden.id,
      estado: 'REEMBOLSADO',
      precioTotal: '45.50',
      precioFinal: '20.00',
      saldo: '0.00',
      reembolso: {
        motivo: MOTIVO,
        hechoPor: expect.any(String),
        fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
      },
    });
  });
});
