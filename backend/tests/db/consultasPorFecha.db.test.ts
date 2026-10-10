import { afterEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../../src/db/pool.js';
import * as auditoria from '../../src/models/auditoria.model.js';
import * as estadisticas from '../../src/models/estadisticas.model.js';
import { anotarAuditoria, crearOrden, crearPago, crearUsuario, escenario } from '../helpers/baseReal.js';

// Contra Postgres real (sección 4). Dos cosas que solo la base puede decir:
//
//   - Que la forma nueva del filtro (`enElPeriodo`) deja entrar y salir los
//     mismos registros que la vieja, justo en los bordes del día. El caso fino es
//     la noche de Bolivia: las 21:00 del 31 ya son el 1 en UTC, que es como se
//     guarda la columna.
//   - Que Postgres de verdad USA el índice de fecha. Eso se ve en el plan
//     (`EXPLAIN`), no en el resultado: una consulta lenta devuelve lo mismo.
//
// Las fechas son de 2024, una ventana que no usa ningún otro test, y cada caso
// filtra además por su propia sucursal o su propio registro.

const MARZO = { desde: '2024-03-01', hasta: '2024-03-31' };

/** Cada borde, con un monto distinto para saber cuál entró. */
const BORDES = [
  { fecha: '2024-02-29T23:59:59-04:00', monto: '1.00', entra: false }, // el último segundo de antes
  { fecha: '2024-03-01T00:00:00Z', monto: '2.00', entra: false }, //      00:00 UTC del 1 = 20:00 del 29 en Bolivia
  { fecha: '2024-03-01T00:00:00-04:00', monto: '4.00', entra: true }, //   el primer segundo del período
  { fecha: '2024-03-31T23:59:59-04:00', monto: '8.00', entra: true }, //   el último, que en UTC ya es 1 de abril
  { fecha: '2024-04-01T00:00:00-04:00', monto: '16.00', entra: false }, // el primero de después
];
const TOTAL_DE_LOS_QUE_ENTRAN = '12.00';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Los bordes del día de Bolivia no cambian — SPEC-ALE186-021', () => {
  it('ingresos cuenta del primer al último segundo del período en Bolivia, ni uno más', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    for (const { fecha, monto } of BORDES) await crearPago(orden, esc, { monto, fechaPago: fecha });

    const resultado = await estadisticas.ingresos({ ...MARZO, sucursalId: esc.sucursalId });

    expect(resultado.total).toBe(TOTAL_DE_LOS_QUE_ENTRAN);
  });

  it('la auditoría deja entrar y salir los mismos registros en los dos bordes', async () => {
    const usuarioId = await crearUsuario({ sucursalId: null, rol: 'ADMIN' });
    const ids = new Map<string, boolean>();
    for (const { fecha, entra } of BORDES) ids.set(await anotarAuditoria({ usuarioId, fecha }), entra);

    const { registros } = await auditoria.consultar(
      { ...MARZO, sucursalId: null, usuarioId, accion: null, tabla: null, registroId: null, soloParaRevisar: false },
      { pagina: 1, porPagina: 50 },
    );

    const esperados = [...ids].filter(([, entra]) => entra).map(([id]) => id);
    expect(registros.map((registro) => registro.id).sort()).toEqual(esperados.sort());
  });
});

/**
 * El plan de Postgres para el SQL que mandó el model, con `enable_seqscan`
 * apagado SOLO en esta transacción.
 *
 * Por qué apagarlo: con pocas filas, recorrer la tabla es más barato que ir al
 * índice, y el planificador elige bien el recorrido. Eso no prueba nada. Apagado,
 * el recorrido queda como último recurso y el planificador muestra si el filtro
 * PUEDE usar el índice.
 *
 * Ojo con lo que se mira: que el plan nombre el índice no alcanza. Con la forma
 * vieja, Postgres también "usa" `idx_pagos_fecha`, pero lo lee ENTERO y aplica
 * la función fila por fila (`Filter`): es un recorrido completo con otro nombre.
 * Lo que prueba la búsqueda es la `Index Cond` sobre la columna: la condición con
 * la que se SALTA al tramo del período dentro del índice.
 */
async function planDe(sql: string, valores: unknown[]): Promise<string> {
  const conexion = await pool.connect();
  try {
    await conexion.query('BEGIN');
    await conexion.query('SET LOCAL enable_seqscan = off');
    const { rows } = await conexion.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${sql}`, valores);
    return rows.map((fila) => fila['QUERY PLAN']).join('\n');
  } finally {
    await conexion.query('ROLLBACK');
    conexion.release();
  }
}

/** El plan busca dentro del índice por la columna, con el borde de abajo del período. */
function buscaPorIndice(plan: string, columna: string): boolean {
  // `String.raw` para que las barras lleguen a la expresión regular tal cual.
  return new RegExp(String.raw`Index Cond: \(+(\w+\.)?` + `${columna} >= `).test(plan);
}

/** Corre `consultar` y devuelve el primer SQL (con sus valores) que mandó al pool. */
async function primeraConsulta(consultar: () => Promise<unknown>): Promise<[string, unknown[]]> {
  const espia = vi.spyOn(pool, 'query');
  await consultar();
  const [sql, valores] = (espia.mock.calls[0] ?? []) as unknown as [string, unknown[]];
  return [sql, valores];
}

describe('El filtro del período usa el índice de fecha — SPEC-ALE186-021', () => {
  it('ingresos busca los pagos por idx_pagos_fecha, sin recorrer la tabla', async () => {
    const [sql, valores] = await primeraConsulta(() => estadisticas.ingresos({ ...MARZO, sucursalId: null }));

    const plan = await planDe(sql, valores);

    expect(plan).toContain('idx_pagos_fecha');
    expect(buscaPorIndice(plan, 'fecha_pago')).toBe(true);
    expect(plan).not.toContain('Seq Scan on pagos');
  });

  it('la auditoría busca por idx_auditoria_fecha, sin recorrer la tabla', async () => {
    const [sql, valores] = await primeraConsulta(() =>
      auditoria.consultar(
        { ...MARZO, sucursalId: null, usuarioId: null, accion: null, tabla: null, registroId: null, soloParaRevisar: false },
        { pagina: 1, porPagina: 50 },
      ),
    );

    const plan = await planDe(sql, valores);

    expect(plan).toContain('idx_auditoria_fecha');
    expect(buscaPorIndice(plan, 'fecha')).toBe(true);
    expect(plan).not.toContain('Seq Scan on auditoria');
  });

  it('con la forma vieja, en cambio, no puede buscar en el índice: lo lee entero y filtra', async () => {
    // El testigo: sin esto, los dos tests de arriba podrían pasar por otra razón
    // (por ejemplo, que `enable_seqscan` bastara para forzar la búsqueda).
    const plan = await planDe(
      `SELECT count(*) FROM pagos p
        WHERE ((p.fecha_pago AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $3)::date
              BETWEEN $1::date AND $2::date`,
      [MARZO.desde, MARZO.hasta, estadisticas.ZONA_NEGOCIO],
    );

    expect(buscaPorIndice(plan, 'fecha_pago')).toBe(false);
    expect(plan).toMatch(/Filter: .*fecha_pago AT TIME ZONE/);
  });
});
