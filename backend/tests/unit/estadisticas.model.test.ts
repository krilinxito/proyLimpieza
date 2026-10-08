import { beforeEach, describe, expect, it, vi } from 'vitest';
import { horaDelNegocio } from '../../src/utils/periodo.js';

// El doble es el POOL: se mira qué SQL arma el model y con qué parámetros. Que
// cuente y sume bien está en tests/db/estadisticasVolumen.db.test.ts, contra
// Postgres real (sección 4): acá solo se vigila lo que se decide en TypeScript.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const estadisticas = await import('../../src/models/estadisticas.model.js');

const SUCURSAL = '22222222-2222-2222-2222-222222222222';
const PERIODO = { desde: '2025-05-01', hasta: '2025-05-31', sucursalId: SUCURSAL };

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

function llamada(): [string, unknown[]] {
  const [sql, valores] = (query.mock.calls[0] ?? []) as [string, unknown[]];
  return [sql, valores];
}

describe('Estadísticas model: volumen y productividad — SPEC-ALE186-013', () => {
  it.each([
    ['volumen', () => estadisticas.volumen(PERIODO), 'o.fecha_entrada'],
    ['productividad', () => estadisticas.productividad(PERIODO), 'a.fecha'],
  ] as const)('%s manda el período, la sucursal y la zona como parámetros', async (_nombre, consultar, columna) => {
    await consultar();

    const [sql, valores] = llamada();
    expect(valores).toEqual(['2025-05-01', '2025-05-31', SUCURSAL, 'America/La_Paz']);
    for (const valor of ['2025-05-01', SUCURSAL, 'America/La_Paz']) expect(sql).not.toContain(valor);
    // El día sale de la hora de Bolivia, no de la fecha guardada en la zona del servidor.
    expect(sql).toContain(`${horaDelNegocio(columna, '$4')}::date BETWEEN $1::date AND $2::date`);
  });

  it('volumen arma todos los días del período, para que los que no tienen órdenes salgan en 0', async () => {
    await estadisticas.volumen(PERIODO);

    expect(llamada()[0]).toMatch(/generate_series\(\$1::date, \$2::date[\s\S]*LEFT JOIN del_periodo/);
  });

  it('productividad toma la sucursal de cada registro, nunca la de la persona hoy', async () => {
    await estadisticas.productividad(PERIODO);

    const [sql] = llamada();
    expect(sql).toContain('JOIN sucursales s ON s.id = a.sucursal_id');
    expect(sql).not.toContain('u.sucursal_id');
  });

  it('sin filas, volumen da totales en 0 y productividad una lista vacía', async () => {
    expect(await estadisticas.volumen(PERIODO)).toEqual({ total: 0, anuladas: 0, porDia: [] });
    expect(await estadisticas.productividad(PERIODO)).toEqual([]);
  });
});

describe('Estadísticas model: atenciones de cada cliente — SPEC-ALE186-017', () => {
  const CLIENTE = '44444444-4444-4444-4444-444444444444';

  it('el total y la página usan el mismo CTE y los mismos filtros, como parámetros', async () => {
    await estadisticas.clientes(PERIODO, CLIENTE, { pagina: 3, porPagina: 20 });

    const [sqlTotal, valoresTotal] = (query.mock.calls[0] ?? []) as [string, unknown[]];
    const [sqlPagina, valoresPagina] = (query.mock.calls[1] ?? []) as [string, unknown[]];
    const ctes = (sql: string) => sql.slice(0, sql.indexOf('por_cliente AS'));
    expect(ctes(sqlTotal)).toBe(ctes(sqlPagina));
    expect(valoresTotal).toEqual(['2025-05-01', '2025-05-31', SUCURSAL, 'America/La_Paz', CLIENTE]);
    expect(valoresPagina).toEqual([...valoresTotal, 20, 40]);
    for (const sql of [sqlTotal, sqlPagina]) {
      expect(sql).not.toContain(CLIENTE);
      expect(sql).not.toContain(SUCURSAL);
    }
  });

  it('cuenta solo órdenes no anuladas, por el día de Bolivia, y suma pagos y no precios', async () => {
    await estadisticas.clientes(PERIODO, null, { pagina: 1, porPagina: 50 });

    const [sql] = (query.mock.calls[0] ?? []) as [string];
    expect(sql).toContain("o.estado <> 'ANULADO'");
    expect(sql).toContain(`${horaDelNegocio('o.fecha_entrada', '$4')}::date BETWEEN $1::date AND $2::date`);
    expect(sql).toContain('SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = o.id');
    expect(sql).not.toContain('precio_total');
  });

  it('dentro del JSON de sucursales, el dinero viaja como texto', async () => {
    await estadisticas.clientes(PERIODO, null, { pagina: 1, porPagina: 50 });

    expect((query.mock.calls[1] as [string])[0]).toContain("'gastado', ps.gastado::numeric(14,2)::text");
  });
});
