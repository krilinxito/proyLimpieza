import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';
import * as auditoria from '../../src/models/auditoria.model.js';
import * as entregas from '../../src/models/entregas.model.js';
import * as ordenItems from '../../src/models/ordenItems.model.js';
import * as ordenes from '../../src/models/ordenes.model.js';
import type { MomentoItem } from '../../src/utils/dominio.js';
import { testApi } from '../helpers/api.js';
import {
  auditoriaDe,
  contar,
  crearOrden,
  crearRenglon,
  crearSucursal,
  escenario,
  leerOrden,
  pagarOrden,
  type Escenario,
  type OrdenCreada,
} from '../helpers/baseReal.js';
import { cuerpoDeRenglon } from '../helpers/ordenItems.js';
import { conSesion } from '../helpers/usuarios.js';

// Contra Postgres real — SPEC-KRILINXI-068. El test del model (`tests/unit/ordenItems.model.test.ts`) comprueba qué
// SQL se arma; este comprueba lo que solo la base puede garantizar: las restricciones de la tabla, que la suma de los
// renglones no pase del total aunque lleguen en cualquier orden (o a la vez), que la entrega calcule su precio final
// con los cargos, y que el historial y la auditoría los encuentren.

function nuevo(
  orden: OrdenCreada,
  esc: Escenario,
  campos: { cantidad: number; precioUnitario: number; momento?: MomentoItem; posicion?: number; id?: string },
): ordenItems.ItemNuevo {
  return {
    id: campos.id ?? randomUUID(),
    ordenId: orden.id,
    momento: campos.momento ?? 'INGRESO',
    posicion: campos.posicion ?? 0,
    descripcion: 'Camisa',
    cantidad: campos.cantidad,
    precioUnitario: campos.precioUnitario,
    usuarioId: esc.usuarioId,
  };
}

function entregaDe(orden: OrdenCreada, esc: Escenario, precioFinal: number | null) {
  return {
    id: randomUUID(),
    ordenId: orden.id,
    tipoRetiro: 'CON_BOLETA',
    retiradoPorNombre: null,
    retiradoPorCarnet: null,
    usuarioEntregaId: esc.usuarioId,
    precioFinal,
    fechaEntrega: null,
  } as const;
}

const renglonesDe = (ordenId: string) => contar('SELECT count(*) FROM orden_items WHERE orden_id = $1', [ordenId]);

describe('orden_items: las restricciones de la tabla — SPEC-KRILINXI-068', () => {
  it.each([
    ['una cantidad de cero', { cantidad: '0', precioUnitario: '10' }],
    ['una cantidad negativa', { cantidad: '-1', precioUnitario: '10' }],
    ['un precio negativo', { cantidad: '1', precioUnitario: '-0.01' }],
    ['una descripción en blanco', { cantidad: '1', precioUnitario: '10', descripcion: '   ' }],
    ['una descripción de más de 150 caracteres', { cantidad: '1', precioUnitario: '10', descripcion: 'x'.repeat(151) }],
    ['una posición negativa', { cantidad: '1', precioUnitario: '10', posicion: -1 }],
  ])('la base rechaza %s', async (_caso, campos) => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    await expect(crearRenglon(orden, campos)).rejects.toThrow();
    expect(await renglonesDe(orden.id)).toBe(0);
  });

  it('la base rechaza un momento que no existe', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    await expect(
      pool.query(
        `INSERT INTO orden_items (id, orden_id, sucursal_id, momento, descripcion, cantidad, precio_unitario)
         VALUES ($1, $2, $3, 'DESPUES', 'Camisa', 1, 10)`,
        [randomUUID(), orden.id, esc.sucursalId],
      ),
    ).rejects.toThrow(/momento_item/);
  });

  it('acepta cantidades con decimales y un precio de cero', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    await crearRenglon(orden, { cantidad: '2.5', precioUnitario: '0' });

    expect(await renglonesDe(orden.id)).toBe(1);
  });
});

describe('orden_items: la suma de la boleta no pasa del total — SPEC-KRILINXI-068', () => {
  it('acepta renglones que suman justo el total, en cualquier orden, y rechaza el centavo de más', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });

    // 2 × 15 + 1 × 15,50 = 45,50, subidos al revés de como se escribieron.
    const segundo = await ordenItems.crear(nuevo(orden, esc, { cantidad: 100, precioUnitario: 1550, posicion: 1 }), {
      sucursalId: esc.sucursalId,
    });
    const primero = await ordenItems.crear(nuevo(orden, esc, { cantidad: 200, precioUnitario: 1500, posicion: 0 }), {
      sucursalId: esc.sucursalId,
    });
    const deMas = await ordenItems.crear(nuevo(orden, esc, { cantidad: 100, precioUnitario: 1 }), {
      sucursalId: esc.sucursalId,
    });

    expect(segundo.tipo).toBe('creado');
    expect(primero.tipo).toBe('creado');
    expect(deMas).toMatchObject({ tipo: 'total-excedido', disponible: '0.00' });
    expect(await renglonesDe(orden.id)).toBe(2);
  });

  it('el subtotal se redondea al centavo, la mitad hacia arriba: 2,5 × 3,33 = 8,33', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '8.33' });

    const justo = await ordenItems.crear(nuevo(orden, esc, { cantidad: 250, precioUnitario: 333 }), {
      sucursalId: null,
    });

    expect(justo.tipo).toBe('creado');
    const { rows } = await pool.query<{ subtotal: string }>(
      `SELECT ${ordenes.SUBTOTAL_SQL('i')}::text AS subtotal FROM orden_items i WHERE i.orden_id = $1`,
      [orden.id],
    );
    expect(rows[0]?.subtotal).toBe('8.33');
  });

  it('si dos renglones llegan a la vez y juntos se pasan, entra uno solo', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });

    const resultados = await Promise.all([
      ordenItems.crear(nuevo(orden, esc, { cantidad: 100, precioUnitario: 3000 }), { sucursalId: null }),
      ordenItems.crear(nuevo(orden, esc, { cantidad: 100, precioUnitario: 3000 }), { sucursalId: null }),
    ]);

    expect(resultados.map((r) => r.tipo).sort()).toEqual(['creado', 'total-excedido']);
    expect(await renglonesDe(orden.id)).toBe(1);
  });

  it('los cargos al entregar no cuentan para el tope: se suman encima', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await crearRenglon(orden, { precioUnitario: '45.50' });

    const cargo = await ordenItems.crear(
      nuevo(orden, esc, { cantidad: 100, precioUnitario: 1500, momento: 'ENTREGA' }),
      { sucursalId: null },
    );

    expect(cargo.tipo).toBe('creado');
  });
});

describe('orden_items: escritura, reintento y auditoría — SPEC-KRILINXI-068', () => {
  it('copia la sucursal de la orden y deja su fila de auditoría a nombre de quien lo cargó', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    const resultado = await ordenItems.crear(nuevo(orden, esc, { cantidad: 100, precioUnitario: 1000 }), {
      sucursalId: esc.sucursalId,
    });

    if (resultado.tipo !== 'creado') throw new Error(`Se esperaba creado y fue ${resultado.tipo}`);
    expect(resultado.item.sucursalId).toBe(esc.sucursalId);
    expect(await auditoriaDe(resultado.item.id)).toEqual([
      { usuarioId: esc.usuarioId, accion: 'CREAR', tablaAfectada: 'orden_items', valoresAnteriores: null },
    ]);
  });

  it('un reintento con el mismo id no duplica el renglón ni la auditoría, aunque ya no entre en el total', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '10.00' });
    const renglon = nuevo(orden, esc, { cantidad: 100, precioUnitario: 1000 });

    await ordenItems.crear(renglon, { sucursalId: null });
    const reintento = await ordenItems.crear(renglon, { sucursalId: null });

    expect(reintento.tipo).toBe('existente');
    expect(await renglonesDe(orden.id)).toBe(1);
    expect(await auditoriaDe(renglon.id)).toHaveLength(1);
  });

  it.each(['ANULADO', 'ENTREGADO'] as const)('una orden %s rechaza el renglón y no escribe nada', async (estado) => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { estado });

    const resultado = await ordenItems.crear(
      nuevo(orden, esc, { cantidad: 100, precioUnitario: 500, momento: 'ENTREGA' }),
      { sucursalId: null },
    );

    expect(resultado.tipo).toBe('orden-cerrada');
    expect(await renglonesDe(orden.id)).toBe(0);
  });

  it('un EMPLEADO no escribe renglones en una orden de otra sucursal', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    const resultado = await ordenItems.crear(nuevo(orden, esc, { cantidad: 100, precioUnitario: 500 }), {
      sucursalId: await crearSucursal(),
    });

    expect(resultado.tipo).toBe('orden-no-encontrada');
    expect(await renglonesDe(orden.id)).toBe(0);
  });

  it('por HTTP: el empleado sube el renglón de su sucursal y la respuesta trae la fila guardada', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    const res = await testApi()
      .post('/api/orden-items')
      .set(conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId }))
      .send(cuerpoDeRenglon({ orden_id: orden.id, cantidad: '2.5', precio_unitario: '4.00' }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ordenId: orden.id, sucursalId: esc.sucursalId, cantidad: '2.50', precioUnitario: '4.00' });
  });
});

describe('Entregas con cargos: el precio final son el total y los cargos — SPEC-KRILINXI-068', () => {
  it('guarda como precio final el total más los cargos, cobrado por completo', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await crearRenglon(orden, { momento: 'ENTREGA', precioUnitario: '15.00', descripcion: 'Recargo por almacenamiento' });
    await pagarOrden(orden, esc, '60.50');

    const resultado = await entregas.crear(entregaDe(orden, esc, 6050), { sucursalId: esc.sucursalId });

    expect(resultado).toMatchObject({ tipo: 'creada', entrega: { precioFinal: '60.50' } });
    expect((await leerOrden(orden.id)).estado).toBe('ENTREGADO');
  });

  it('sin precio de la tablet, también lo calcula con los cargos', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await crearRenglon(orden, { momento: 'ENTREGA', cantidad: '2', precioUnitario: '2.25' });
    await pagarOrden(orden, esc, '50.00');

    expect(await entregas.crear(entregaDe(orden, esc, null), { sucursalId: null })).toMatchObject({
      tipo: 'creada',
      entrega: { precioFinal: '50.00' },
    });
  });

  it('una boleta sin renglones (de antes) se entrega por su total, como siempre', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc);

    expect(await entregas.crear(entregaDe(orden, esc, 4550), { sucursalId: null })).toMatchObject({
      tipo: 'creada',
      entrega: { precioFinal: '45.50' },
    });
  });

  it('si la tablet calculó otro precio (un cargo que no llegó), no escribe nada y dice el que corresponde', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '60.50');

    // La tablet sumó un cargo de 15 que el servidor no tiene.
    const resultado = await entregas.crear(entregaDe(orden, esc, 6050), { sucursalId: null });

    expect(resultado).toMatchObject({ tipo: 'precio-distinto', precioFinal: '45.50' });
    expect((await leerOrden(orden.id)).estado).toBe('RECIBIDO');
    expect(await contar('SELECT count(*) FROM entregas WHERE orden_id = $1', [orden.id])).toBe(0);
  });

  it('una entrega con un precio libre más bajo que el total (una versión anterior) se rechaza', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc, '40.00');

    expect(await entregas.crear(entregaDe(orden, esc, 4000), { sucursalId: null })).toMatchObject({
      tipo: 'precio-distinto',
    });
  });

  it('con el cargo, lo pagado por el total ya no alcanza: saldo pendiente con lo que falta', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await crearRenglon(orden, { momento: 'ENTREGA', precioUnitario: '15.00' });
    await pagarOrden(orden, esc, '45.50');

    expect(await entregas.crear(entregaDe(orden, esc, 6050), { sucursalId: null })).toMatchObject({
      tipo: 'saldo-pendiente',
      saldo: '15.00',
    });
  });

  it('un cargo que llega después de entregar no entra: la orden ya está cerrada', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await pagarOrden(orden, esc);
    await entregas.crear(entregaDe(orden, esc, 4550), { sucursalId: null });

    const tarde = await ordenItems.crear(
      nuevo(orden, esc, { cantidad: 100, precioUnitario: 500, momento: 'ENTREGA' }),
      { sucursalId: null },
    );

    expect(tarde.tipo).toBe('orden-cerrada');
  });
});

describe('Los renglones en el historial y en la auditoría — SPEC-KRILINXI-068', () => {
  const SIN_FILTROS = { desde: null, hasta: null, estado: null, texto: null, conSaldo: false };

  it('GET /api/ordenes trae los renglones de cada boleta: primero los de ingreso, en su orden, y después los cargos', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });
    await crearRenglon(orden, { momento: 'ENTREGA', precioUnitario: '5.00', descripcion: 'Recargo' });
    await crearRenglon(orden, { posicion: 1, precioUnitario: '15.50', descripcion: 'Edredón' });
    await crearRenglon(orden, { posicion: 0, cantidad: '2', precioUnitario: '15.00', descripcion: 'Camisa' });
    const sinRenglones = await crearOrden(esc);

    const { boletas } = await ordenes.listar(
      { ...SIN_FILTROS, sucursalId: esc.sucursalId },
      { pagina: 1, porPagina: 50 },
    );

    const conRenglones = boletas.find((b) => b.id === orden.id);
    expect(conRenglones?.renglones.map((r) => [r.momento, r.descripcion, r.cantidad, r.precioUnitario, r.subtotal])).toEqual([
      ['INGRESO', 'Camisa', '2.00', '15.00', '30.00'],
      ['INGRESO', 'Edredón', '1.00', '15.50', '15.50'],
      ['ENTREGA', 'Recargo', '1.00', '5.00', '5.00'],
    ]);
    expect(boletas.find((b) => b.id === sinRenglones.id)?.renglones).toEqual([]);
  });

  it('la auditoría pone el renglón en la sucursal de su orden y lo encuentra al filtrar por el cliente', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    const resultado = await ordenItems.crear(nuevo(orden, esc, { cantidad: 100, precioUnitario: 500 }), {
      sucursalId: null,
    });
    if (resultado.tipo !== 'creado') throw new Error(`Se esperaba creado y fue ${resultado.tipo}`);

    const { registros } = await auditoria.consultar(
      {
        desde: '2000-01-01',
        hasta: '2999-12-31',
        usuarioId: null,
        accion: null,
        tabla: 'orden_items',
        registroId: null,
        sucursalId: null,
        clienteId: esc.clienteId,
        soloParaRevisar: false,
      },
      { pagina: 1, porPagina: 50 },
    );

    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ registroId: resultado.item.id, sucursalId: esc.sucursalId });
  });
});
