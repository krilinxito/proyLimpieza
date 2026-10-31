import { beforeEach, describe, expect, it, vi } from 'vitest';

// El doble es el POOL, como en los demás tests de model: lo que se prueba es qué
// SQL arma el historial y con qué parámetros. Que ese SQL filtre y sume bien lo
// dice solo Postgres: está en tests/db/ordenesHistorial.db.test.ts.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const ordenes = await import('../../src/models/ordenes.model.js');

const SIN_FILTROS = { desde: null, hasta: null, sucursalId: null, estado: null, texto: null, conSaldo: false };
const PAGINA = { pagina: 1, porPagina: 50 };

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [{ total: 0 }] });
});

/** [sql, valores] de la consulta del conteo (la primera) y de la página (la segunda). */
function consultas(): { conteo: [string, unknown[]]; pagina: [string, unknown[]] } {
  return {
    conteo: query.mock.calls[0] as [string, unknown[]],
    pagina: query.mock.calls[1] as [string, unknown[]],
  };
}

describe('Historial de boletas: el SQL que arma el model — SPEC-KRILINXI-040', () => {
  it('hace dos consultas con los mismos filtros: el total y la página', async () => {
    await ordenes.listar({ ...SIN_FILTROS, sucursalId: 'una-sucursal', estado: 'RECIBIDO' }, PAGINA);

    const { conteo, pagina } = consultas();
    expect(query).toHaveBeenCalledTimes(2);
    expect(conteo[0]).toMatch(/count\(\*\)/);
    // La página repite los 8 filtros y agrega el límite y el salto.
    expect(pagina[1].slice(0, 8)).toEqual(conteo[1]);
    expect(pagina[1].slice(8)).toEqual([50, 0]);
  });

  it('salta las filas de las páginas anteriores', async () => {
    await ordenes.listar(SIN_FILTROS, { pagina: 3, porPagina: 20 });

    expect(consultas().pagina[1].slice(8)).toEqual([20, 40]);
  });

  it('ordena de la más nueva a la más vieja, con el id para desempatar', async () => {
    await ordenes.listar(SIN_FILTROS, PAGINA);

    expect(consultas().pagina[0]).toMatch(/ORDER BY historial\.fecha_entrada DESC, id DESC/);
  });

  it('el saldo sale de vw_saldos y el período compara la columna sin tocarla', async () => {
    await ordenes.listar(SIN_FILTROS, PAGINA);

    const [sql] = consultas().pagina;
    expect(sql).toMatch(/FROM vw_saldos v/);
    expect(sql).toMatch(/v\.saldo_pendiente::numeric\(14,2\)\s+AS saldo/);
    // `enElPeriodo`: el borde de abajo es `>=` y el de arriba `<` (SPEC-ALE186-021).
    expect(sql).toMatch(/o\.fecha_entrada >= /);
    expect(sql).toMatch(/o\.fecha_entrada < /);
    expect(sql).not.toMatch(/::date BETWEEN/);
  });

  it('manda los filtros como parámetros, nunca escritos dentro del SQL', async () => {
    await ordenes.listar(
      { desde: '2026-09-01', hasta: '2026-09-30', sucursalId: 'sucursal-x', estado: 'RECIBIDO', texto: 'Rosa', conSaldo: true },
      PAGINA,
    );

    const [sql, valores] = consultas().conteo;
    expect(valores.slice(0, 6)).toEqual([
      '2026-09-01',
      '2026-09-30',
      'America/La_Paz',
      'sucursal-x',
      'RECIBIDO',
      '%Rosa%',
    ]);
    expect(valores[7]).toBe(true);
    for (const literal of ['sucursal-x', 'Rosa', '2026-09-01']) expect(sql).not.toContain(literal);
  });

  it('sin filtros, todos los parámetros de filtro van en null (o false)', async () => {
    await ordenes.listar(SIN_FILTROS, PAGINA);

    expect(consultas().conteo[1]).toEqual([null, null, 'America/La_Paz', null, null, null, null, false]);
  });

  it('el texto busca también por teléfono, con solo sus dígitos', async () => {
    await ordenes.listar({ ...SIN_FILTROS, texto: '7012-34' }, PAGINA);

    const [sql, valores] = consultas().conteo;
    expect(valores[5]).toBe('%7012-34%'); // boleta y nombre, tal cual se escribió
    expect(valores[6]).toBe('%701234%'); // teléfono: sin el guion
    expect(sql).toMatch(/c\.telefono LIKE \$7/);
  });

  it('un texto sin dígitos no busca en el teléfono', async () => {
    await ordenes.listar({ ...SIN_FILTROS, texto: 'Rosa' }, PAGINA);

    expect(consultas().conteo[1][6]).toBeNull();
  });

  it('los comodines del LIKE escritos por la persona valen por sí mismos', async () => {
    await ordenes.listar({ ...SIN_FILTROS, texto: '50%_a\\b' }, PAGINA);

    expect(consultas().conteo[1][5]).toBe('%50\\%\\_a\\\\b%');
  });

  it('"con saldo" deja afuera las anuladas, como /saldos', async () => {
    await ordenes.listar({ ...SIN_FILTROS, conSaldo: true }, PAGINA);

    expect(consultas().conteo[0]).toMatch(/o\.estado <> 'ANULADO' AND v\.saldo_pendiente > 0/);
  });

  it('arma cada boleta con su sucursal y su cliente anidados, y devuelve el total', async () => {
    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [{ total: 7 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'o1',
            numero_boleta: '001234',
            sucursal_id: 's1',
            sucursal_nombre: 'Centro',
            cliente_id: 'c1',
            cliente_nombre: 'Rosa Quispe',
            cliente_telefono: '70123456',
            descripcion: '2 camisas',
            estado: 'RECIBIDO',
            fecha_entrada: '2026-09-30 10:15:00',
            fecha_estimada_salida: null,
            precio_total: '45.50',
            precio_final: null,
            tipo_retiro: null,
            retirado_por_nombre: null,
            retirado_por_carnet: null,
            pagado: '10.00',
            saldo: '35.50',
          },
        ],
      });

    const resultado = await ordenes.listar(SIN_FILTROS, PAGINA);

    expect(resultado).toEqual({
      total: 7,
      boletas: [
        {
          id: 'o1',
          numeroBoleta: '001234',
          sucursal: { id: 's1', nombre: 'Centro' },
          cliente: { id: 'c1', nombre: 'Rosa Quispe', telefono: '70123456' },
          descripcion: '2 camisas',
          estado: 'RECIBIDO',
          fechaEntrada: '2026-09-30 10:15:00',
          fechaEstimadaSalida: null,
          precioTotal: '45.50',
          precioFinal: null,
          retiro: null,
          pagado: '10.00',
          saldo: '35.50',
        },
      ],
    });
  });

  it('arma el retiro de una boleta entregada: sin boleta con nombre y carnet, con boleta sin ellos — SPEC-KRILINXI-060', async () => {
    const base = {
      id: 'o', numero_boleta: '1', sucursal_id: 's', sucursal_nombre: 'Centro', cliente_id: 'c',
      cliente_nombre: 'Rosa', cliente_telefono: '7', descripcion: '', estado: 'ENTREGADO',
      fecha_entrada: '2026-09-30 10:15:00', fecha_estimada_salida: null, precio_total: '1.00',
      precio_final: '1.00', pagado: '1.00', saldo: '0.00',
    };
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [{ total: 2 }] }).mockResolvedValueOnce({
      rows: [
        { ...base, tipo_retiro: 'SIN_BOLETA', retirado_por_nombre: 'Luis', retirado_por_carnet: '123 LP' },
        { ...base, tipo_retiro: 'CON_BOLETA', retirado_por_nombre: null, retirado_por_carnet: null },
      ],
    });

    const { boletas } = await ordenes.listar(SIN_FILTROS, PAGINA);

    expect(boletas.map((b) => b.retiro)).toEqual([
      { tipo: 'SIN_BOLETA', nombre: 'Luis', carnet: '123 LP' },
      { tipo: 'CON_BOLETA', nombre: null, carnet: null },
    ]);
  });
});
