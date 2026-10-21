import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enElPeriodo } from '../../src/utils/periodo.js';

const PARAMETROS_DEL_PERIODO = { desde: '$1', hasta: '$2', zona: '$4' };

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
    ['volumen', () => estadisticas.volumen(PERIODO), ['o.fecha_entrada']],
    // Desde SPEC-ALE186-021, la productividad filtra en cada parte de la unión.
    ['productividad', () => estadisticas.productividad(PERIODO), ['fecha_entrada', 'fecha_pago', 'fecha_entrega']],
  ] as const)('%s manda el período, la sucursal y la zona como parámetros', async (_nombre, consultar, columnas) => {
    await consultar();

    const [sql, valores] = llamada();
    expect(valores).toEqual(['2025-05-01', '2025-05-31', SUCURSAL, 'America/La_Paz']);
    for (const valor of ['2025-05-01', SUCURSAL, 'America/La_Paz']) expect(sql).not.toContain(valor);
    // El período son días de Bolivia, no de la zona del servidor.
    for (const columna of columnas) expect(sql).toContain(enElPeriodo(columna, PARAMETROS_DEL_PERIODO));
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
    expect(sql).toContain(enElPeriodo('o.fecha_entrada', PARAMETROS_DEL_PERIODO));
    expect(sql).toContain('SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = o.id');
    expect(sql).not.toContain('precio_total');
  });

  it('dentro del JSON de sucursales, el dinero viaja como texto', async () => {
    await estadisticas.clientes(PERIODO, null, { pagina: 1, porPagina: 50 });

    expect((query.mock.calls[1] as [string])[0]).toContain("'gastado', ps.gastado::numeric(14,2)::text");
  });
});

describe('Estadísticas model: ingresos por día — SPEC-KRILINXI-043', () => {
  /** Una fila del SQL: un día, y uno de sus métodos con cobros (o ninguno). */
  const fila = (fecha: string, metodo: string | null, totalMetodo: string | null, totalDia: string, totalGeneral: string) => ({
    fecha,
    metodo,
    total_metodo: totalMetodo,
    total_dia: totalDia,
    total_general: totalGeneral,
  });

  it('manda el período, la sucursal y la zona como parámetros, nunca escritos en el SQL', async () => {
    await estadisticas.ingresosPorDia(PERIODO);

    const [sql, valores] = llamada();
    expect(valores).toEqual(['2025-05-01', '2025-05-31', SUCURSAL, 'America/La_Paz']);
    for (const valor of ['2025-05-01', SUCURSAL, 'America/La_Paz']) expect(sql).not.toContain(valor);
  });

  it('filtra por período con `enElPeriodo` sobre fecha_pago, para que sirva su índice', async () => {
    await estadisticas.ingresosPorDia(PERIODO);

    const [sql] = llamada();
    expect(sql).toContain(enElPeriodo('p.fecha_pago', PARAMETROS_DEL_PERIODO));
    expect(sql).not.toMatch(/::date BETWEEN/);
  });

  it('agrupa por el día de Bolivia, no por el de la zona del servidor', async () => {
    await estadisticas.ingresosPorDia(PERIODO);

    // `horaDelNegocio` convierte la columna a la zona del negocio ($4) y recién después toma el día.
    expect(llamada()[0]).toMatch(/AT TIME ZONE current_setting\('TimeZone'\)\) AT TIME ZONE \$4\)::date AS fecha/);
  });

  it('arma todos los días del período, para que los que no tienen cobros salgan en cero', async () => {
    await estadisticas.ingresosPorDia(PERIODO);

    expect(llamada()[0]).toMatch(/generate_series\(\$1::date, \$2::date[\s\S]*LEFT JOIN cobros/);
  });

  it('las sumas las hace Postgres, con funciones de ventana: el model no suma ningún monto', async () => {
    await estadisticas.ingresosPorDia(PERIODO);

    const [sql] = llamada();
    expect(sql).toMatch(/SUM\(cobros\.monto\) OVER \(PARTITION BY dias\.fecha\)/);
    expect(sql).toMatch(/SUM\(cobros\.monto\) OVER \(\)/);
  });

  it('reacomoda las filas en un registro por día, con las cuatro formas de pago y "0.00" en las que no cobraron', async () => {
    query.mockResolvedValue({
      rows: [
        fila('2025-05-01', 'EFECTIVO', '10.00', '15.50', '15.50'),
        fila('2025-05-01', 'QR', '5.50', '15.50', '15.50'),
        fila('2025-05-02', null, null, '0.00', '15.50'),
      ],
    });

    const resultado = await estadisticas.ingresosPorDia(PERIODO);

    expect(resultado).toEqual({
      total: '15.50',
      porDia: [
        { fecha: '2025-05-01', total: '15.50', porMetodo: { EFECTIVO: '10.00', QR: '5.50', TARJETA: '0.00', TRANSFERENCIA: '0.00' } },
        { fecha: '2025-05-02', total: '0.00', porMetodo: { EFECTIVO: '0.00', QR: '0.00', TARJETA: '0.00', TRANSFERENCIA: '0.00' } },
      ],
    });
  });

  it('devuelve los montos tal como llegan de Postgres, sin tocarlos', async () => {
    query.mockResolvedValue({ rows: [fila('2025-05-01', 'EFECTIVO', '0.10', '0.30', '0.30'), fila('2025-05-01', 'QR', '0.20', '0.30', '0.30')] });

    const { total, porDia } = await estadisticas.ingresosPorDia(PERIODO);

    expect(total).toBe('0.30');
    expect(porDia[0]?.total).toBe('0.30');
  });

  it('sin filas, el total es "0.00" y no hay días', async () => {
    expect(await estadisticas.ingresosPorDia(PERIODO)).toEqual({ total: '0.00', porDia: [] });
  });
});
