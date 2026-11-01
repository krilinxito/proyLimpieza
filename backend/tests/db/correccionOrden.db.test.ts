import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';
import * as auditoria from '../../src/models/auditoria.model.js';
import { BoletaOcupadaError } from '../../src/models/ordenes.model.js';
import { corregirOrden, type RenglonCorregido } from '../../src/services/correccionOrden.js';
import { testApi } from '../helpers/api.js';
import {
  auditoriaDe,
  contar,
  crearEntrega,
  crearOrden,
  crearPago,
  crearRenglon,
  crearSucursal,
  crearUsuario,
  escenario,
  leerOrden,
  type Escenario,
  type OrdenCreada,
} from '../helpers/baseReal.js';
import { conSesion } from '../helpers/usuarios.js';

// Contra Postgres real — SPEC-KRILINXI-071. El test HTTP (`tests/http/ordenes.test.ts`) comprueba qué valida el
// controller y qué responde; este, lo que solo la base garantiza: que la corrección sea todo o nada (una boleta
// repetida en la sucursal nueva no deja nada a medias), que mover una boleta se lleve sus pagos, su entrega y sus
// renglones, que las prendas queden exactamente como se mandaron, y lo que anota la auditoría.

/** Un admin de verdad: la auditoría apunta a `usuarios` con clave foránea. */
async function unAdmin(): Promise<string> {
  return crearUsuario({ sucursalId: null, rol: 'ADMIN' });
}

async function filaDeLaOrden(id: string) {
  const { rows } = await pool.query<{
    numero_boleta: string;
    descripcion: string;
    precio_total: string;
    sucursal_id: string;
    estado: string;
  }>('SELECT numero_boleta, descripcion, precio_total, sucursal_id, estado FROM ordenes WHERE id = $1', [id]);
  return rows[0];
}

/** Las prendas (INGRESO) de la orden, como quedaron. */
async function prendasDe(ordenId: string) {
  const { rows } = await pool.query<{ id: string; descripcion: string; cantidad: string; precio_unitario: string }>(
    `SELECT id, descripcion, cantidad, precio_unitario FROM orden_items
      WHERE orden_id = $1 AND momento = 'INGRESO' ORDER BY posicion, id`,
    [ordenId],
  );
  return rows;
}

/** En qué sucursal quedó cada copia de `sucursal_id` de la orden: la orden, sus pagos, su entrega y sus renglones. */
async function sucursalesDeLaOrden(ordenId: string): Promise<string[]> {
  const { rows } = await pool.query<{ sucursal_id: string }>(
    `SELECT sucursal_id FROM ordenes WHERE id = $1
     UNION ALL SELECT sucursal_id FROM pagos WHERE orden_id = $1
     UNION ALL SELECT sucursal_id FROM entregas WHERE orden_id = $1
     UNION ALL SELECT sucursal_id FROM orden_items WHERE orden_id = $1`,
    [ordenId],
  );
  return rows.map((fila) => fila.sucursal_id);
}

function prenda(campos: Partial<RenglonCorregido> = {}): RenglonCorregido {
  return { id: randomUUID(), descripcion: 'Camisa', cantidad: 100, precioUnitario: 1000, ...campos };
}

/** Una boleta con todo lo que tiene una copia de la sucursal: dos prendas, un cargo, un cobro y la entrega. */
async function boletaCompleta(esc: Escenario): Promise<OrdenCreada & { pagoId: string; entregaId: string }> {
  const orden = await crearOrden(esc, { precioTotal: '30.00' });
  await crearRenglon(orden, { descripcion: 'Camisa', cantidad: '2', precioUnitario: '10.00', posicion: 0 });
  await crearRenglon(orden, { descripcion: 'Saco', cantidad: '1', precioUnitario: '10.00', posicion: 1 });
  await crearRenglon(orden, { momento: 'ENTREGA', descripcion: 'Recargo', precioUnitario: '5.00' });
  const pagoId = await crearPago(orden, esc, { monto: '35.00', tipo: 'PAGO_FINAL' });
  const entregaId = await crearEntrega(orden, esc, { precioFinal: '35.00' });
  return { ...orden, pagoId, entregaId };
}

describe('El admin mueve una boleta de sucursal — SPEC-KRILINXI-071', () => {
  it('la orden, su cobro, su entrega y todos sus renglones quedan en la sucursal nueva', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const nueva = await crearSucursal();
    const orden = await boletaCompleta(esc);

    const resultado = await corregirOrden(orden.id, { sucursalId: nueva }, admin);

    expect(resultado).toMatchObject({ tipo: 'corregida', orden: { sucursalId: nueva } });
    const sucursales = await sucursalesDeLaOrden(orden.id);
    expect(sucursales).toHaveLength(1 + 1 + 1 + 3);
    expect(new Set(sucursales)).toEqual(new Set([nueva]));
  });

  it('la auditoría anota la sucursal anterior y la nueva, en la fila de la orden; los pagos no anotan nada', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const nueva = await crearSucursal();
    const orden = await boletaCompleta(esc);

    await corregirOrden(orden.id, { sucursalId: nueva }, admin);

    expect(await auditoriaDe(orden.id)).toEqual([
      {
        usuarioId: admin,
        accion: 'EDITAR',
        tablaAfectada: 'ordenes',
        valoresAnteriores: { sucursal_id: esc.sucursalId, sucursal_id_nueva: nueva },
      },
    ]);
    expect(await auditoriaDe(orden.pagoId)).toEqual([]);
    expect(await auditoriaDe(orden.entregaId)).toEqual([]);
  });

  it('si en la sucursal nueva ya hay una boleta con ese número, no cambia NADA: ni la sucursal, ni lo demás', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const nueva = await crearSucursal();
    const orden = await boletaCompleta(esc);
    // Otra boleta con el mismo número, en la sucursal adonde se quiere mover.
    await pool.query(
      `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id, descripcion, precio_total)
       VALUES ($1, $2, $3, $4, $5, 'Otra', 10)`,
      [randomUUID(), orden.numeroBoleta, esc.clienteId, nueva, esc.usuarioId],
    );

    await expect(
      corregirOrden(
        orden.id,
        { sucursalId: nueva, descripcion: 'Cambiada', renglones: [prenda({ descripcion: 'Terno', precioUnitario: 3000 })] },
        admin,
      ),
    ).rejects.toBeInstanceOf(BoletaOcupadaError);

    // La transacción se deshizo entera: la descripción, las prendas y las copias de la sucursal siguen como estaban.
    expect(await filaDeLaOrden(orden.id)).toMatchObject({ descripcion: 'Ropa de prueba', sucursal_id: esc.sucursalId });
    expect(new Set(await sucursalesDeLaOrden(orden.id))).toEqual(new Set([esc.sucursalId]));
    expect((await prendasDe(orden.id)).map((p) => p.descripcion)).toEqual(['Camisa', 'Saco']);
    expect(await auditoriaDe(orden.id)).toEqual([]);
  });

  it('por la API, el mismo caso responde 409 BOLETA_DUPLICADA', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const nueva = await crearSucursal();
    const orden = await crearOrden(esc);
    await crearOrden({ ...esc, sucursalId: nueva }, { sucursalId: nueva });
    await pool.query('UPDATE ordenes SET numero_boleta = $1 WHERE sucursal_id = $2', [orden.numeroBoleta, nueva]);

    const res = await testApi()
      .patch(`/api/ordenes/${orden.id}`)
      .set(conSesion({ id: admin, rol: 'ADMIN', sucursalId: null }))
      .send({ sucursal_id: nueva });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('BOLETA_DUPLICADA');
    expect((await leerOrden(orden.id)).sucursalId).toBe(esc.sucursalId);
  });

  it('a una sucursal cerrada no se mueve, y responde 409 SUCURSAL_CERRADA por la API', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const cerrada = await crearSucursal();
    await pool.query('UPDATE sucursales SET activa = false, cerrada_en = LOCALTIMESTAMP WHERE id = $1', [cerrada]);
    const orden = await crearOrden(esc);

    expect(await corregirOrden(orden.id, { sucursalId: cerrada }, admin)).toEqual({ tipo: 'sucursal-cerrada' });

    const res = await testApi()
      .patch(`/api/ordenes/${orden.id}`)
      .set(conSesion({ id: admin, rol: 'ADMIN', sucursalId: null }))
      .send({ sucursal_id: cerrada });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('SUCURSAL_CERRADA');
    expect((await leerOrden(orden.id)).sucursalId).toBe(esc.sucursalId);
  });

  it('a una sucursal que no existe tampoco', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    expect(await corregirOrden(orden.id, { sucursalId: randomUUID() }, await unAdmin())).toEqual({
      tipo: 'sucursal-no-existe',
    });
  });

  it('un EMPLEADO no la mueve: 403, y la boleta sigue donde estaba', async () => {
    const esc = await escenario();
    const nueva = await crearSucursal();
    const orden = await crearOrden(esc);

    const res = await testApi()
      .patch(`/api/ordenes/${orden.id}`)
      .set(conSesion({ id: esc.usuarioId, rol: 'EMPLEADO', sucursalId: esc.sucursalId }))
      .send({ sucursal_id: nueva });

    expect(res.status).toBe(403);
    expect((await leerOrden(orden.id)).sucursalId).toBe(esc.sucursalId);
  });
});

describe('Las sync rules siguen a la boleta movida, en los dos buckets — SPEC-KRILINXI-071', () => {
  const SYNC_RULES = readFileSync(resolve(import.meta.dirname, '../../../docker/powersync/sync-rules.yaml'), 'utf8');

  /** Las consultas `data` de un bucket, como las escribió el archivo. */
  function consultasDe(bucket: string): string[] {
    const [, cuerpo = ''] =
      new RegExp(`^ {2}${bucket}:\\n([\\s\\S]*?)(?=^ {2}\\w+:\\n|(?![\\s\\S]))`, 'm').exec(SYNC_RULES) ?? [];
    return [...cuerpo.matchAll(/^\s*- (SELECT .+)$/gm)].map(([, consulta = '']) => consulta.trim());
  }

  /**
   * Lo que bajaría de esta orden una tablet de esa sucursal: corre cada consulta de `data` del bucket en Postgres, con
   * `bucket.sucursal_id` como parámetro. PowerSync evalúa esas mismas condiciones sobre las filas que replica; las
   * consultas son SQL simple (sin JOIN), así que Postgres las entiende igual.
   */
  async function loQueBajaria(bucket: string, sucursalId: string, ordenId: string): Promise<number> {
    let filas = 0;
    for (const consulta of consultasDe(bucket)) {
      const sql = consulta.replace('bucket.sucursal_id', '$1::uuid');
      const { rows } = await pool.query<{ id: string; orden_id?: string }>(sql, [sucursalId]);
      filas += rows.filter((fila) => fila.id === ordenId || fila.orden_id === ordenId).length;
    }
    return filas;
  }

  it.each(['sucursal', 'atencion_admin'])(
    'en el bucket %s, la boleta y todo lo suyo deja de bajar en la anterior y baja en la nueva',
    async (bucket) => {
      expect(consultasDe(bucket)).toHaveLength(4);
      const esc = await escenario();
      const nueva = await crearSucursal();
      const orden = await boletaCompleta(esc);
      // La orden, su cobro, su entrega y sus tres renglones.
      expect(await loQueBajaria(bucket, esc.sucursalId, orden.id)).toBe(6);
      expect(await loQueBajaria(bucket, nueva, orden.id)).toBe(0);

      await corregirOrden(orden.id, { sucursalId: nueva }, await unAdmin());

      expect(await loQueBajaria(bucket, esc.sucursalId, orden.id)).toBe(0);
      expect(await loQueBajaria(bucket, nueva, orden.id)).toBe(6);
    },
  );
});

describe('El admin corrige las prendas de una boleta — SPEC-KRILINXI-071', () => {
  it('agrega, cambia y quita: quedan exactamente las que mandó, y el total es su suma', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const orden = await crearOrden(esc, { precioTotal: '30.00' });
    const camisa = await crearRenglon(orden, { descripcion: 'Camisa', cantidad: '2', precioUnitario: '10.00' });
    const saco = await crearRenglon(orden, { descripcion: 'Saco', precioUnitario: '10.00', posicion: 1 });
    const edredon = prenda({ descripcion: 'Edredón', cantidad: 150, precioUnitario: 2000 });

    const resultado = await corregirOrden(
      orden.id,
      { renglones: [{ id: camisa, descripcion: 'Camisa', cantidad: 300, precioUnitario: 1000 }, edredon] },
      admin,
    );

    expect(resultado).toMatchObject({ tipo: 'corregida', orden: { precioTotal: '60.00' } });
    expect(await prendasDe(orden.id)).toEqual([
      { id: camisa, descripcion: 'Camisa', cantidad: '3.00', precio_unitario: '10.00' },
      { id: edredon.id, descripcion: 'Edredón', cantidad: '1.50', precio_unitario: '20.00' },
    ]);
    expect(await contar('SELECT count(*) FROM orden_items WHERE id = $1', [saco])).toBe(0);
  });

  it('cada prenda anota lo suyo: CREAR la nueva, EDITAR solo lo que cambió, ELIMINAR con todo lo que había', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const orden = await crearOrden(esc, { precioTotal: '30.00' });
    const camisa = await crearRenglon(orden, { descripcion: 'Camisa', cantidad: '2', precioUnitario: '10.00' });
    const saco = await crearRenglon(orden, { descripcion: 'Saco', precioUnitario: '10.00', posicion: 1 });
    const nueva = prenda({ descripcion: 'Edredón' });

    await corregirOrden(
      orden.id,
      { renglones: [{ id: camisa, descripcion: 'Camisa', cantidad: 300, precioUnitario: 1000 }, nueva] },
      admin,
    );

    expect(await auditoriaDe(camisa)).toEqual([
      { usuarioId: admin, accion: 'EDITAR', tablaAfectada: 'orden_items', valoresAnteriores: { cantidad: '2.00' } },
    ]);
    expect(await auditoriaDe(nueva.id)).toEqual([
      { usuarioId: admin, accion: 'CREAR', tablaAfectada: 'orden_items', valoresAnteriores: null },
    ]);
    expect(await auditoriaDe(saco)).toEqual([
      {
        usuarioId: admin,
        accion: 'ELIMINAR',
        tablaAfectada: 'orden_items',
        valoresAnteriores: {
          orden_id: orden.id,
          momento: 'INGRESO',
          posicion: 1,
          descripcion: 'Saco',
          cantidad: '1.00',
          precio_unitario: '10.00',
        },
      },
    ]);
    // Y la orden, su total (de 30 a 40).
    expect(await auditoriaDe(orden.id)).toEqual([
      { usuarioId: admin, accion: 'EDITAR', tablaAfectada: 'ordenes', valoresAnteriores: { precio_total: '30.00' } },
    ]);
  });

  it('la consulta de la auditoría ubica la prenda quitada en la sucursal de su orden, aunque ya no exista', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const orden = await crearOrden(esc, { precioTotal: '10.00' });
    const saco = await crearRenglon(orden, { descripcion: 'Saco', precioUnitario: '10.00' });

    await corregirOrden(orden.id, { renglones: [], precioTotal: 1000 }, admin);

    const { registros } = await auditoria.consultar(
      {
        desde: '2000-01-01',
        hasta: '2999-12-31',
        usuarioId: null,
        accion: 'ELIMINAR',
        tabla: null,
        registroId: saco,
        sucursalId: null,
        clienteId: null,
        soloParaRevisar: false,
      },
      { pagina: 1, porPagina: 10 },
    );
    expect(registros).toHaveLength(1);
    expect(registros[0]?.sucursalId).toBe(esc.sucursalId);
  });

  it('una prenda que llega igual que estaba no escribe ni anota nada', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const orden = await crearOrden(esc, { precioTotal: '20.00' });
    const camisa = await crearRenglon(orden, { descripcion: 'Camisa', cantidad: '2', precioUnitario: '10.00' });

    const resultado = await corregirOrden(
      orden.id,
      { renglones: [{ id: camisa, descripcion: 'Camisa', cantidad: 200, precioUnitario: 1000 }] },
      admin,
    );

    expect(resultado.tipo).toBe('corregida');
    expect(await auditoriaDe(camisa)).toEqual([]);
    // El total ya era 20: tampoco la orden anota.
    expect(await auditoriaDe(orden.id)).toEqual([]);
  });

  it('un cargo al entregar no se corrige: 400 y no se escribe nada', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const orden = await boletaCompleta(esc);
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM orden_items WHERE orden_id = $1 AND momento = 'ENTREGA'`,
      [orden.id],
    );
    const cargo = rows[0]?.id ?? '';

    const resultado = await corregirOrden(
      orden.id,
      { descripcion: 'Cambiada', renglones: [{ id: cargo, descripcion: 'Recargo', cantidad: 100, precioUnitario: 100 }] },
      admin,
    );

    expect(resultado).toMatchObject({ tipo: 'renglon-ajeno', esCargo: true, renglonId: cargo });
    expect((await filaDeLaOrden(orden.id))?.descripcion).toBe('Ropa de prueba');
    expect(await contar(`SELECT count(*) FROM orden_items WHERE id = $1 AND precio_unitario = 5`, [cargo])).toBe(1);
  });

  it('una prenda de OTRA boleta tampoco: no se la roba', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '10.00' });
    const otra = await crearOrden(esc, { precioTotal: '10.00' });
    const ajena = await crearRenglon(otra, { precioUnitario: '10.00' });

    const resultado = await corregirOrden(
      orden.id,
      { renglones: [{ id: ajena, descripcion: 'Camisa', cantidad: 100, precioUnitario: 1000 }] },
      await unAdmin(),
    );

    expect(resultado).toMatchObject({ tipo: 'renglon-ajeno', esCargo: false });
    expect(await contar('SELECT count(*) FROM orden_items WHERE id = $1 AND orden_id = $2', [ajena, otra.id])).toBe(1);
  });

  it('el total escrito a mano, en una boleta con prendas, tiene que ser lo que suman', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const orden = await crearOrden(esc, { precioTotal: '20.00' });
    await crearRenglon(orden, { cantidad: '2', precioUnitario: '10.00' });

    expect(await corregirOrden(orden.id, { precioTotal: 2500 }, admin)).toMatchObject({
      tipo: 'total-distinto-de-renglones',
      suma: '20.00',
    });
    expect((await filaDeLaOrden(orden.id))?.precio_total).toBe('20.00');
    // Una boleta de antes de los renglones sí cambia su total a mano.
    const vieja = await crearOrden(esc, { precioTotal: '20.00' });
    expect(await corregirOrden(vieja.id, { precioTotal: 2500 }, admin)).toMatchObject({
      tipo: 'corregida',
      orden: { precioTotal: '25.00' },
    });
  });
});

describe('El total y lo ya cobrado — SPEC-KRILINXI-071', () => {
  it('con la ropa en el local, el total no baja de lo cobrado: 409 y no se escribe nada', async () => {
    const esc = await escenario();
    const admin = await unAdmin();
    const orden = await crearOrden(esc, { precioTotal: '30.00' });
    const camisa = await crearRenglon(orden, { cantidad: '3', precioUnitario: '10.00' });
    await crearPago(orden, esc, { monto: '25.00' });

    const resultado = await corregirOrden(
      orden.id,
      { descripcion: 'Cambiada', renglones: [{ id: camisa, descripcion: 'Camisa', cantidad: 200, precioUnitario: 1000 }] },
      admin,
    );

    expect(resultado).toMatchObject({ tipo: 'total-menor-que-cobrado', pagado: '25.00' });
    expect(await filaDeLaOrden(orden.id)).toMatchObject({ precio_total: '30.00', descripcion: 'Ropa de prueba' });
    expect((await prendasDe(orden.id))[0]?.cantidad).toBe('3.00');
  });

  it('justo lo cobrado sí se puede', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '30.00' });
    await crearPago(orden, esc, { monto: '25.00' });

    expect(await corregirOrden(orden.id, { precioTotal: 2500 }, await unAdmin())).toMatchObject({ tipo: 'corregida' });
  });

  it('ya entregada, corregir las prendas no toca el precio final ni el saldo, aunque el total baje de lo cobrado', async () => {
    const esc = await escenario();
    const orden = await boletaCompleta(esc);

    const resultado = await corregirOrden(orden.id, { renglones: [prenda({ precioUnitario: 1500 })] }, await unAdmin());

    expect(resultado).toMatchObject({ tipo: 'corregida', orden: { precioTotal: '15.00', estado: 'ENTREGADO' } });
    const { rows } = await pool.query<{ precio_final: string; saldo: string }>(
      `SELECT e.precio_final, v.saldo_pendiente::numeric(14,2)::text AS saldo
         FROM entregas e JOIN vw_saldos v ON v.orden_id = e.orden_id WHERE e.orden_id = $1`,
      [orden.id],
    );
    expect(rows[0]).toEqual({ precio_final: '35.00', saldo: '0.00' });
  });
});

describe('El admin corrige boletas en cualquier estado — SPEC-KRILINXI-071', () => {
  it.each(['ENTREGADO', 'REEMBOLSADO', 'ANULADO'] as const)(
    'una boleta %s se corrige: número, descripción y fechas',
    async (estado) => {
      const esc = await escenario();
      const admin = await unAdmin();
      const orden = await crearOrden(esc, { estado, fechaEntrada: '2026-10-01T10:00:00-04:00' });

      const resultado = await corregirOrden(
        orden.id,
        {
          numeroBoleta: 'C-0071',
          descripcion: '1 Terno',
          fechaEntrada: '2026-09-30T18:00:00-04:00',
          fechaEstimadaSalida: '2026-10-05',
        },
        admin,
      );

      expect(resultado).toMatchObject({
        tipo: 'corregida',
        orden: { numeroBoleta: 'C-0071', descripcion: '1 Terno', fechaEstimadaSalida: '2026-10-05', estado },
      });
      const [fila] = await auditoriaDe(orden.id);
      expect(fila?.valoresAnteriores).toMatchObject({
        numero_boleta: orden.numeroBoleta,
        descripcion: 'Ropa de prueba',
        fecha_estimada_salida: null,
      });
      expect(fila?.valoresAnteriores).toHaveProperty('fecha_entrada');
    },
  );

  it('un PATCH que no cambia nada responde la orden y no anota', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    const resultado = await corregirOrden(orden.id, { descripcion: 'Ropa de prueba', sucursalId: esc.sucursalId }, await unAdmin());

    expect(resultado.tipo).toBe('corregida');
    expect(await auditoriaDe(orden.id)).toEqual([]);
  });

  it('una fecha de ingreso en el futuro no se acepta', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    const { rows } = await pool.query<{ futura: string }>(
      `SELECT to_char(now() + interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SSOF') AS futura`,
    );

    expect(await corregirOrden(orden.id, { fechaEntrada: rows[0]?.futura ?? '' }, await unAdmin())).toEqual({
      tipo: 'fecha-futura',
    });
  });

  it('una boleta que no existe', async () => {
    expect(await corregirOrden(randomUUID(), { descripcion: 'x' }, await unAdmin())).toEqual({ tipo: 'no-encontrada' });
  });
});
