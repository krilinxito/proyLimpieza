import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCIONES_AUDITORIA } from '../../src/utils/dominio.js';
import { IDS } from '../helpers/ordenes.js';

// El doble es el POOL, como en los demás tests de model: lo que se prueba es qué
// SQL arma la auditoría y con qué parámetros. Que ese SQL sea atómico y anote lo
// que tiene que anotar solo lo puede decir Postgres: eso está en
// tests/db/auditoria.db.test.ts.
vi.mock('../../src/db/pool.js', () => ({ pool: { query: vi.fn() } }));

const { pool } = await import('../../src/db/pool.js');
const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
const auditoria = await import('../../src/models/auditoria.model.js');
const clientes = await import('../../src/models/clientes.model.js');
const ordenes = await import('../../src/models/ordenes.model.js');
const pagos = await import('../../src/models/pagos.model.js');
const entregas = await import('../../src/models/entregas.model.js');
const usuarios = await import('../../src/models/usuarios.model.js');
const sucursales = await import('../../src/models/sucursales.model.js');

const AUTOR = '99999999-9999-9999-9999-999999999999';

beforeEach(() => {
  query.mockReset();
  // Una fila mínima que todos los models saben traducir (usuarios exige el rol).
  query.mockResolvedValue({ rows: [{ id: IDS.orden, rol: 'EMPLEADO' }] });
});

function llamada(): [string, unknown[]] {
  const [sql, valores] = (query.mock.calls[0] ?? []) as [string, unknown[]];
  return [sql, valores];
}

describe('Auditoría: cómo se encadena a una escritura — SPEC-ALE186-010', () => {
  const ESCRITURA = {
    sql: 'INSERT INTO clientes (id) VALUES ($1) RETURNING id, nombre',
    valores: ['un-id'],
    columnas: 'id, nombre',
  };

  it('pone los parámetros de la auditoría DESPUÉS de los de la escritura', () => {
    const { sql, valores } = auditoria.conAuditoria(ESCRITURA, {
      usuarioId: AUTOR,
      accion: 'CREAR',
      tabla: 'clientes',
    });

    expect(valores).toEqual(['un-id', AUTOR, 'CREAR', 'clientes']);
    // Quién, qué y dónde van como $2, $3, $4: nunca escritos dentro del SQL.
    expect(sql).toMatch(/SELECT \$2::uuid, \$3::accion_auditoria, \$4, escrita\.id, NULL/);
    expect(sql).not.toContain(AUTOR);
    expect(sql).not.toContain("'CREAR'");
  });

  it('saca la fila de auditoría de lo que devolvió la escritura, y devuelve solo sus columnas', () => {
    const { sql } = auditoria.conAuditoria(ESCRITURA, { usuarioId: AUTOR, accion: 'CREAR', tabla: 'clientes' });

    // Si la escritura no devuelve filas (un reintento), `auditada` no tiene de dónde sacar la suya.
    expect(sql).toMatch(/^WITH escrita AS \(\s*INSERT INTO clientes/);
    expect(sql).toMatch(/INSERT INTO auditoria[\s\S]*FROM escrita/);
    expect(sql).toMatch(/SELECT id, nombre FROM escrita$/);
  });

  it('con valores anteriores, no anota una edición que no cambió nada', () => {
    const { sql } = auditoria.conAuditoria(ESCRITURA, {
      usuarioId: AUTOR,
      accion: 'EDITAR',
      tabla: 'clientes',
      conValoresAnteriores: true,
    });

    expect(sql).toContain('escrita.valores_anteriores\n');
    expect(sql).toContain(`WHERE escrita.valores_anteriores <> '{}'::jsonb`);
  });

  it('pone los CTE previos arriba de todo: uno que escribe no puede ir anidado', () => {
    const { sql } = auditoria.conAuditoria(
      { ...ESCRITURA, ctesPrevios: 'orden AS (UPDATE ordenes SET estado = $2 RETURNING id)' },
      { usuarioId: AUTOR, accion: 'ENTREGAR', tabla: 'entregas' },
    );

    expect(sql).toMatch(/^WITH orden AS \(UPDATE ordenes[^)]*\),\s*escrita AS \(/);
  });
});

describe('Auditoría: los valores de antes — SPEC-ALE186-010', () => {
  it('guarda cada columna solo si cambió, con el valor que tenía', () => {
    const expresion = auditoria.valoresAnteriores([{ columna: 'nombre' }, { columna: 'carnet' }]);

    expect(expresion).toMatch(
      /CASE WHEN antes\.nombre IS DISTINCT FROM c\.nombre\s+THEN jsonb_build_object\('nombre', antes\.nombre\)/,
    );
    expect(expresion).toContain('antes.carnet IS DISTINCT FROM c.carnet');
    expect(expresion).toContain(' || ');
  });

  it('guarda el dinero como texto, para que no vuelva como float', () => {
    expect(auditoria.valoresAnteriores([{ columna: 'precio_total', comoTexto: true }])).toContain(
      "jsonb_build_object('precio_total', antes.precio_total::text)",
    );
  });

  it('de una columna marcada, guarda solo que cambió, nunca su valor', () => {
    const expresion = auditoria.valoresAnteriores([{ columna: 'password_hash', soloMarca: 'contrasena_cambiada' }]);

    expect(expresion).toBe(`(jsonb_build_object('contrasena_cambiada', true))`);
    expect(expresion).not.toContain('antes.password_hash');
  });

  it('sin columnas, un objeto vacío', () => {
    expect(auditoria.valoresAnteriores([])).toBe(`'{}'::jsonb`);
  });

  it('el UPDATE lee y bloquea la fila de antes con las condiciones del model', () => {
    const sql = auditoria.updateConAntes({
      tabla: 'clientes',
      asignaciones: ['nombre = $2'],
      condiciones: 'id = $1',
      columnas: 'id, nombre',
      auditadas: [{ columna: 'nombre' }],
    });

    expect(sql).toMatch(/^UPDATE clientes AS c SET nombre = \$2/);
    expect(sql).toContain('FROM (SELECT id, nombre FROM clientes WHERE id = $1 FOR UPDATE) AS antes');
    expect(sql).toContain('WHERE c.id = antes.id');
    expect(sql).toMatch(/RETURNING c\.id, c\.nombre, \(CASE[\s\S]*AS valores_anteriores$/);
  });
});

describe('Auditoría: cada escritura anota lo suyo — SPEC-ALE186-010', () => {
  // Las diez escrituras auditadas: con qué acción, en qué tabla y a nombre de
  // quién. Si mañana hay una escritura nueva, va una línea más acá.
  const ESCRITURAS: [string, () => Promise<unknown>, string, string, string][] = [
    [
      'el alta de un cliente',
      () => clientes.crear({ id: IDS.cliente, nombre: 'Ana', telefono: '70000000', carnet: null, sucursalRegistroId: null }, AUTOR),
      'CREAR', 'clientes', AUTOR,
    ],
    ['la edición de un cliente', () => clientes.actualizar(IDS.cliente, { nombre: 'Ana' }, AUTOR), 'EDITAR', 'clientes', AUTOR],
    [
      'el alta de una orden',
      () =>
        ordenes.crear({
          id: IDS.orden, numeroBoleta: '001', clienteId: IDS.cliente, sucursalId: IDS.sucursal,
          usuarioRecepcionId: IDS.usuario, descripcion: 'Terno', precioTotal: 4550,
          fechaEstimadaSalida: null, fechaEntrada: null,
        }),
      'CREAR', 'ordenes', IDS.usuario,
    ],
    [
      'la anulación de una orden',
      () => ordenes.actualizar(IDS.orden, { estado: 'ANULADO' }, { estadosDeOrigen: ['LISTO'], sucursalId: null }, AUTOR),
      'EDITAR', 'ordenes', AUTOR,
    ],
    [
      'un cobro',
      () =>
        pagos.crear(
          { id: IDS.orden, ordenId: IDS.orden, monto: 100, tipo: 'ADELANTO', metodo: 'QR', usuarioId: IDS.usuario, fechaPago: null },
          { sucursalId: null },
        ),
      'COBRAR', 'pagos', IDS.usuario,
    ],
    [
      'una entrega',
      () =>
        entregas.crear(
          {
            id: IDS.orden, ordenId: IDS.orden, tipoRetiro: 'CON_BOLETA', retiradoPorNombre: null,
            retiradoPorCarnet: null, usuarioEntregaId: IDS.usuario, precioFinal: null, fechaEntrega: null,
          },
          { sucursalId: null },
        ),
      'ENTREGAR', 'entregas', IDS.usuario,
    ],
    [
      'el alta de una cuenta',
      () =>
        usuarios.registrar({
          id: IDS.usuario, nombreCompleto: 'Rosa', username: 'rosa', passwordHash: 'h', rol: 'EMPLEADO',
          sucursalId: IDS.sucursal, telefono: null, creadoPor: AUTOR,
        }),
      'CREAR', 'usuarios', AUTOR,
    ],
    ['la edición de una cuenta', () => usuarios.actualizar(IDS.usuario, { activo: false }, AUTOR), 'EDITAR', 'usuarios', AUTOR],
    // SPEC-ALE186-011
    [
      'el alta de una sucursal',
      () => sucursales.registrar({ id: IDS.sucursal, nombre: 'Norte', direccion: null, telefono: null }, AUTOR),
      'CREAR', 'sucursales', AUTOR,
    ],
    ['el cierre de una sucursal', () => sucursales.actualizar(IDS.sucursal, { activa: false }, AUTOR), 'EDITAR', 'sucursales', AUTOR],
  ];

  it.each(ESCRITURAS)('%s anota %s en %s, en la misma sentencia', async (_caso, escribir, accion, tabla, autor) => {
    await escribir();

    // Una sola consulta: la escritura y su auditoría van juntas.
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, valores] = llamada();
    expect(sql).toContain('INSERT INTO auditoria');
    expect(valores.slice(-3)).toEqual([autor, accion, tabla]);
    expect(ACCIONES_AUDITORIA).toContain(accion);
    // Los valores van como parámetros: ninguno de los tres aparece dentro del SQL.
    expect(sql).not.toContain(autor);
    expect(sql).not.toContain(`'${accion}'`);
  });

  it('la semilla del primer admin no anota nada: no hay sesión de quién atribuirlo', async () => {
    await usuarios.crear({ nombreCompleto: 'Admin', username: 'admin', passwordHash: 'h', rol: 'ADMIN', sucursalId: null });

    expect(llamada()[0]).not.toContain('auditoria');
  });

  it('una edición vacía no escribe ni anota', async () => {
    await clientes.actualizar(IDS.cliente, {}, AUTOR);
    await usuarios.actualizar(IDS.usuario, {}, AUTOR);
    await ordenes.actualizar(IDS.orden, {}, { estadosDeOrigen: ['LISTO'], sucursalId: null }, AUTOR);

    for (const [sql] of query.mock.calls as [string][]) expect(sql).not.toContain('auditoria');
  });
});

describe('Auditoría suelta: el login — SPEC-ALE186-010', () => {
  it('inserta con todo como parámetro', async () => {
    await auditoria.registrar({ usuarioId: AUTOR, accion: 'LOGIN', tabla: 'usuarios', registroId: AUTOR });

    const [sql, valores] = llamada();
    expect(sql).toMatch(/INSERT INTO auditoria \(usuario_id, accion, tabla_afectada, registro_id\)\s+VALUES \(\$1, \$2, \$3, \$4\)/);
    expect(valores).toEqual([AUTOR, 'LOGIN', 'usuarios', AUTOR]);
  });
});

describe('Auditoría: la consulta del admin — SPEC-ALE186-012', () => {
  const FILTROS = {
    desde: '2026-03-01',
    hasta: '2026-03-31',
    sucursalId: IDS.sucursal,
    usuarioId: IDS.usuario,
    accion: 'COBRAR' as const,
    tabla: 'pagos' as const,
    registroId: IDS.orden,
    soloParaRevisar: false,
  };

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [{ total: 7 }] }).mockResolvedValueOnce({ rows: [] });
  });

  it('el total y la página filtran con el mismo SQL y los mismos parámetros', async () => {
    const { total } = await auditoria.consultar(FILTROS, { pagina: 3, porPagina: 2 });

    expect(total).toBe(7);
    const [sqlTotal, valoresTotal] = (query.mock.calls[0] ?? []) as [string, unknown[]];
    const [sqlPagina, valoresPagina] = (query.mock.calls[1] ?? []) as [string, unknown[]];
    // Lo mismo hasta el final del CTE: si uno filtrara distinto, el total mentiría.
    const filtradas = (sql: string) => sql.slice(0, sql.indexOf('\n)') + 2);
    expect(filtradas(sqlTotal)).toBe(filtradas(sqlPagina));
    expect(valoresPagina.slice(0, 9)).toEqual(valoresTotal);
    // La página 3 de a 2 se saltea las 4 primeras.
    expect(valoresPagina.slice(9)).toEqual([2, 4]);
  });

  it('todos los filtros van como parámetros, nunca dentro del SQL', async () => {
    await auditoria.consultar(FILTROS, { pagina: 1, porPagina: 50 });

    const [sql, valores] = query.mock.calls[0] as [string, unknown[]];
    expect(valores).toEqual(['2026-03-01', '2026-03-31', 'America/La_Paz', IDS.usuario, 'COBRAR', 'pagos', IDS.orden, IDS.sucursal, false]);
    for (const valor of [IDS.usuario, IDS.sucursal, IDS.orden, '2026-03-01', "'COBRAR'"]) {
      expect(sql).not.toContain(valor);
    }
  });

  it('la sucursal de cada acción sale del registro tocado, y del cliente solo en su alta', async () => {
    await auditoria.consultar(FILTROS, { pagina: 1, porPagina: 50 });

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain("WHEN 'ordenes'  THEN (SELECT o.sucursal_id FROM ordenes  o WHERE o.id = a.registro_id)");
    expect(sql).toMatch(/WHEN 'clientes' THEN CASE WHEN a\.accion = 'CREAR'\s+THEN \(SELECT c\.sucursal_registro_id/);
    // Nunca la sucursal de la persona: si la movieron, lo viejo cambiaría de lugar.
    expect(sql).not.toContain('u.sucursal_id');
  });
});

describe('Auditoría: la fecha del hecho — SPEC-ALE186-015', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [{ total: 0 }] }).mockResolvedValueOnce({ rows: [] });
  });

  it('sale del registro tocado con un CASE sobre la tabla, y de la orden solo en su alta', async () => {
    await auditoria.consultar(
      { desde: '2026-03-01', hasta: '2026-03-31', sucursalId: null, usuarioId: null, accion: null, tabla: null, registroId: null, soloParaRevisar: false },
      { pagina: 1, porPagina: 50 },
    );

    const [sql] = query.mock.calls[1] as [string];
    expect(sql).toMatch(/WHEN 'ordenes'\s+THEN CASE WHEN a\.accion = 'CREAR'\s+THEN \(SELECT o\.fecha_entrada/);
    expect(sql).toContain("WHEN 'pagos'    THEN (SELECT p.fecha_pago");
    expect(sql).toContain("WHEN 'entregas' THEN (SELECT e.fecha_entrega");
    // Se formatea en la hora del negocio con la zona que la consulta ya tenía ($3).
    expect(sql).toMatch(/to_char\(\(\(fecha_del_hecho AT TIME ZONE current_setting\('TimeZone'\)\) AT TIME ZONE \$3\)/);
  });

  it('no agrega parámetros: los filtros (nueve desde SPEC-ALE186-018), más el límite y el salto de la página', async () => {
    await auditoria.consultar(
      { desde: '2026-03-01', hasta: '2026-03-31', sucursalId: null, usuarioId: null, accion: null, tabla: null, registroId: null, soloParaRevisar: false },
      { pagina: 1, porPagina: 50 },
    );

    expect((query.mock.calls[0] as [string, unknown[]])[1]).toHaveLength(9);
    expect((query.mock.calls[1] as [string, unknown[]])[1]).toHaveLength(11);
  });
});

describe('Auditoría: la marca de revisión — SPEC-ALE186-018', () => {
  const ESCRITURA = { sql: 'INSERT INTO clientes (id) VALUES ($1) RETURNING id', valores: ['un-id'], columnas: 'id' };
  const AUTOR = '99999999-9999-9999-9999-999999999999';

  it('sin marca, arma exactamente el mismo SQL que antes', () => {
    const sinMarca = auditoria.conAuditoria(ESCRITURA, { usuarioId: AUTOR, accion: 'CREAR', tabla: 'clientes' });
    const conNull = auditoria.conAuditoria(ESCRITURA, { usuarioId: AUTOR, accion: 'CREAR', tabla: 'clientes', revision: null });

    expect(conNull).toEqual(sinMarca);
    expect(sinMarca.sql).not.toContain('revision');
  });

  // Desde SPEC-ALE186-020 la marca va en su propia columna, `revision`.
  it('con marca, la escribe como parámetro en la columna revision', () => {
    const { sql, valores } = auditoria.conAuditoria(ESCRITURA, {
      usuarioId: AUTOR,
      accion: 'CREAR',
      tabla: 'clientes',
      revision: 'cuenta_dada_de_baja',
    });

    expect(valores).toEqual(['un-id', AUTOR, 'CREAR', 'clientes', 'cuenta_dada_de_baja']);
    expect(sql).toContain('INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id, valores_anteriores, revision)');
    expect(sql).toContain('escrita.id, NULL, $5::text');
    expect(sql).not.toContain("'cuenta_dada_de_baja'");
  });

  it('en una edición, la marca no toca los valores de antes ni el filtro de "no cambió nada"', () => {
    const { sql } = auditoria.conAuditoria(ESCRITURA, {
      usuarioId: AUTOR,
      accion: 'EDITAR',
      tabla: 'clientes',
      conValoresAnteriores: true,
      revision: 'cuenta_dada_de_baja',
    });

    expect(sql).toContain('escrita.id, escrita.valores_anteriores, $5::text');
    expect(sql).not.toContain("jsonb_build_object('revision'");
    expect(sql).toContain("WHERE escrita.valores_anteriores <> '{}'::jsonb");
  });
});
