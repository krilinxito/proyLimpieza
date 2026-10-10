import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enElPeriodo } from '../../src/utils/periodo.js';

// Con un doble del pool (sección 4): acá se mira el SQL que arma cada model. Que
// la forma nueva dé los mismos resultados y use el índice lo dice la base real,
// en tests/db/consultasPorFecha.db.test.ts.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const estadisticas = await import('../../src/models/estadisticas.model.js');
const auditoria = await import('../../src/models/auditoria.model.js');

const PERIODO = { desde: '2026-03-01', hasta: '2026-03-31', sucursalId: null };
const DE_ESTADISTICAS = { desde: '$1', hasta: '$2', zona: '$4' };
const PAGINA = { pagina: 1, porPagina: 20 };

beforeEach(() => {
  query.mockReset();
  // La auditoría lee primero el total; a las demás les alcanza una lista vacía.
  query.mockResolvedValue({ rows: [] });
});

/** Todo el SQL que mandó el model, junto. */
function sqlEnviado(): string {
  return (query.mock.calls as [string][]).map(([sql]) => sql).join('\n');
}

describe('El filtro del período compara la columna tal cual — SPEC-ALE186-021', () => {
  it('enElPeriodo deja la columna sin funciones y convierte solo los bordes', () => {
    const sql = enElPeriodo('p.fecha_pago', { desde: '$1', hasta: '$2', zona: '$4' });

    // La columna aparece sola a la izquierda de cada comparación.
    expect(sql).toMatch(/^\(p\.fecha_pago >= /);
    expect(sql).toMatch(/AND p\.fecha_pago < /);
    expect(sql).not.toMatch(/p\.fecha_pago AT TIME ZONE/);
    // El borde de abajo es el comienzo de `desde`; el de arriba, el del día siguiente a `hasta`.
    expect(sql).toContain('(($1::date)::timestamp AT TIME ZONE $4) AT TIME ZONE current_setting(\'TimeZone\')');
    expect(sql).toContain('(($2::date + 1)::timestamp AT TIME ZONE $4) AT TIME ZONE current_setting(\'TimeZone\')');
  });

  it.each([
    ['ingresos', () => estadisticas.ingresos(PERIODO), ['p.fecha_pago']],
    ['saldos', () => estadisticas.saldos(PERIODO, '2026-03-31'), ['o.fecha_entrada']],
    // Sobre la columna de `ordenes`, que tiene índice, y no sobre la de la vista.
    ['sin recoger', () => estadisticas.sinRecoger(PERIODO, '2026-03-31'), ['o.fecha_entrada']],
    ['volumen', () => estadisticas.volumen(PERIODO), ['o.fecha_entrada']],
    ['productividad', () => estadisticas.productividad(PERIODO), ['fecha_entrada', 'fecha_pago', 'fecha_entrega']],
    ['clientes', () => estadisticas.clientes(PERIODO, null, PAGINA), ['o.fecha_entrada']],
  ] as const)('%s filtra con enElPeriodo y ya no con "::date BETWEEN"', async (_nombre, consultar, columnas) => {
    await consultar();

    const sql = sqlEnviado();
    for (const columna of columnas) expect(sql).toContain(enElPeriodo(columna, DE_ESTADISTICAS));
    expect(sql).not.toContain('::date BETWEEN');
  });

  it('la auditoría filtra con enElPeriodo y ya no con "::date BETWEEN"', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: 0 }] });

    await auditoria.consultar(
      { ...PERIODO, usuarioId: null, accion: null, tabla: null, registroId: null, soloParaRevisar: false },
      PAGINA,
    );

    const sql = sqlEnviado();
    expect(sql).toContain(enElPeriodo('a.fecha', { desde: '$1', hasta: '$2', zona: '$3' }));
    expect(sql).not.toContain('::date BETWEEN');
  });

  it('la productividad filtra dentro de cada parte de la unión, no sobre el resultado unido', async () => {
    await estadisticas.productividad(PERIODO);

    const sql = sqlEnviado();
    const union = sql.slice(sql.indexOf('WITH acciones AS ('), sql.indexOf('\n     )'));
    const partes = union.split('UNION ALL');
    expect(partes).toHaveLength(3);
    const columnas = ['fecha_entrada', 'fecha_pago', 'fecha_entrega'];
    partes.forEach((parte, i) => expect(parte).toContain(enElPeriodo(columnas[i] ?? '', DE_ESTADISTICAS)));
    // Después de la unión ya no queda ningún filtro de fechas.
    expect(sql.slice(sql.indexOf('\n     )'))).not.toContain('current_setting');
  });
});
