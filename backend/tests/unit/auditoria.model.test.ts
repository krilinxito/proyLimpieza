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
