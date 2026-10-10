import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { pool } from '../../src/db/pool.js';
import { CARPETA_DE_MIGRACIONES, MigracionFallidaError, migrar } from '../../src/db/migraciones.js';
import { testApi } from '../helpers/api.js';
import { baseDescartable, type BaseDescartable } from '../helpers/baseDescartable.js';
import { contar, crearUsuario, escenario } from '../helpers/baseReal.js';
import { cuerpoDeOrden } from '../helpers/ordenes.js';
import { cuerpoDeSucursal } from '../helpers/sucursales.js';
import { comoAdmin, conSesion } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4). Esta spec mueve tres parches del código a la
// base —una columna, otra columna y un índice único—, así que hay dos cosas que
// probar y ninguna se puede con un doble:
//
//   - Que las migraciones lleven bien los datos que ya existían. Eso se hace en
//     bases descartables (`baseDescartable`): la línea base, los datos con la
//     forma de antes, y recién ahí `migrar`. La base compartida ya viene migrada.
//   - Que la base haga cumplir las reglas nuevas: dos altas simultáneas, la fecha
//     de cierre puesta por la misma sentencia, una cerrada sin fecha conocida.

const aLimpiar: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (aLimpiar.length > 0) await aLimpiar.pop()?.();
});

/** Una base con la línea base y SIN migrar, y una conexión a ella. */
async function baseSinMigrar(): Promise<pg.Client> {
  const base: BaseDescartable = await baseDescartable({ conLineaBase: true });
  aLimpiar.push(() => base.borrar());
  const conexion = await base.conectar();
  aLimpiar.push(() => conexion.end());
  return conexion;
}

async function nuevaSucursal(conexion: pg.Client, nombre: string, activa = true): Promise<string> {
  const id = randomUUID();
  await conexion.query('INSERT INTO sucursales (id, nombre, activa) VALUES ($1, $2, $3)', [id, nombre, activa]);
  return id;
}

async function nuevoAdmin(conexion: pg.Client): Promise<string> {
  const id = randomUUID();
  await conexion.query(
    `INSERT INTO usuarios (id, sucursal_id, nombre_completo, username, password_hash, rol)
     VALUES ($1, NULL, 'Admin', $2, 'sin-hash', 'ADMIN')`,
    [id, `admin_${id.slice(0, 8)}`],
  );
  return id;
}

/** Una fila de auditoría con la forma que dejaba el código antes de esta spec. */
async function anotar(
  conexion: pg.Client,
  campos: { usuarioId: string; accion: string; tabla: string; registroId: string; valores: unknown; fecha?: string },
): Promise<string> {
  const { rows } = await conexion.query<{ id: string }>(
    `INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id, valores_anteriores, fecha)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, LOCALTIMESTAMP)) RETURNING id`,
    [campos.usuarioId, campos.accion, campos.tabla, campos.registroId, JSON.stringify(campos.valores), campos.fecha ?? null],
  );
  return rows[0]?.id ?? '';
}

describe('Las migraciones llevan los datos de antes — SPEC-ALE186-020', () => {
  it('la marca de revisión pasa de valores_anteriores a su columna, y lo demás queda igual', async () => {
    const conexion = await baseSinMigrar();
    const admin = await nuevoAdmin(conexion);
    const registro = randomUUID();
    // Un alta marcada (la marca sola), una edición marcada y una sin marca.
    const alta = await anotar(conexion, { usuarioId: admin, accion: 'CREAR', tabla: 'clientes', registroId: registro, valores: { revision: 'cuenta_dada_de_baja' } });
    const edicion = await anotar(conexion, { usuarioId: admin, accion: 'EDITAR', tabla: 'clientes', registroId: registro, valores: { nombre: 'Ana', revision: 'cuenta_dada_de_baja' } });
    const normal = await anotar(conexion, { usuarioId: admin, accion: 'EDITAR', tabla: 'clientes', registroId: registro, valores: { nombre: 'Eva' } });

    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    const { rows } = await conexion.query<{ id: string; revision: string | null; valores_anteriores: unknown }>(
      'SELECT id, revision, valores_anteriores FROM auditoria',
    );
    const porId = new Map(rows.map((fila) => [fila.id, fila]));
    expect(porId.get(alta)).toMatchObject({ revision: 'cuenta_dada_de_baja', valores_anteriores: null });
    expect(porId.get(edicion)).toMatchObject({ revision: 'cuenta_dada_de_baja', valores_anteriores: { nombre: 'Ana' } });
    expect(porId.get(normal)).toMatchObject({ revision: null, valores_anteriores: { nombre: 'Eva' } });
  });

  it('cerrada_en sale del último cierre anotado; sin rastro, o abierta, queda vacía', async () => {
    const conexion = await baseSinMigrar();
    const admin = await nuevoAdmin(conexion);
    const conRastro = await nuevaSucursal(conexion, 'Con rastro', false);
    const sinRastro = await nuevaSucursal(conexion, 'Sin rastro', false);
    const abierta = await nuevaSucursal(conexion, 'Reabierta', true);
    const cierre = (registroId: string, fecha: string) =>
      anotar(conexion, { usuarioId: admin, accion: 'EDITAR', tabla: 'sucursales', registroId, valores: { activa: true }, fecha });
    await cierre(conRastro, '2026-01-10 09:00:00');
    await cierre(conRastro, '2026-03-05 18:30:00');
    // Un cambio de nombre no es un cierre, aunque sea más reciente.
    await anotar(conexion, { usuarioId: admin, accion: 'EDITAR', tabla: 'sucursales', registroId: conRastro, valores: { nombre: 'Vieja' }, fecha: '2026-04-01 10:00:00' });
    await cierre(abierta, '2026-02-01 12:00:00');

    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    const { rows } = await conexion.query<{ id: string; cerrada_en: string | null }>(
      "SELECT id, to_char(cerrada_en, 'YYYY-MM-DD HH24:MI:SS') AS cerrada_en FROM sucursales",
    );
    const cerradaEn = new Map(rows.map((fila) => [fila.id, fila.cerrada_en]));
    expect(cerradaEn.get(conRastro)).toBe('2026-03-05 18:30:00');
    expect(cerradaEn.get(sinRastro)).toBeNull();
    expect(cerradaEn.get(abierta)).toBeNull();
  });

  it('con nombres repetidos, la migración del índice falla nombrándolos y no deja nada a medias', async () => {
    const conexion = await baseSinMigrar();
    await nuevaSucursal(conexion, 'Central');
    await nuevaSucursal(conexion, ' central ');
    await nuevaSucursal(conexion, 'Norte');

    const error = await migrar(conexion, CARPETA_DE_MIGRACIONES).catch((causa: unknown) => causa);

    expect(error).toBeInstanceOf(MigracionFallidaError);
    expect((error as MigracionFallidaError).archivo).toBe('003_sucursales_nombre_unico.sql');
    expect((error as MigracionFallidaError).detalle).toContain('"Central"');
    expect((error as MigracionFallidaError).detalle).toContain('" central "');
    expect((error as MigracionFallidaError).detalle).not.toContain('Norte');
    const { rows } = await conexion.query<{ nombre: string }>('SELECT nombre FROM migraciones_aplicadas ORDER BY nombre');
    expect(rows.map((fila) => fila.nombre)).toEqual(['001_auditoria_revision.sql', '002_sucursales_cerrada_en.sql']);
    expect(await indices(conexion)).not.toContain('uq_sucursales_nombre');

    // Renombrada una, la siguiente corrida termina lo que faltaba.
    await conexion.query("UPDATE sucursales SET nombre = 'Central 2' WHERE nombre = ' central '");
    expect(await migrar(conexion, CARPETA_DE_MIGRACIONES)).toEqual([
      '003_sucursales_nombre_unico.sql',
      '004_auditoria_registro_id.sql',
    ]);
  });

  it('se aplican limpias, dejan los índices, y un segundo migrar no hace nada', async () => {
    const conexion = await baseSinMigrar();

    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    expect(await indices(conexion)).toEqual(
      expect.arrayContaining(['idx_auditoria_revision', 'uq_sucursales_nombre', 'idx_auditoria_registro']),
    );
    expect(await migrar(conexion, CARPETA_DE_MIGRACIONES)).toEqual([]);
  });
});

async function indices(conexion: pg.Client): Promise<string[]> {
  const { rows } = await conexion.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE tablename IN ('auditoria', 'sucursales')",
  );
  return rows.map((fila) => fila.indexname);
}

async function unAdmin() {
  return comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
}

async function cerradaEn(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ cerrada_en: string | null }>(
    'SELECT cerrada_en::text AS cerrada_en FROM sucursales WHERE id = $1',
    [id],
  );
  return rows[0]?.cerrada_en ?? null;
}

describe('El nombre único lo garantiza la base — SPEC-ALE186-020', () => {
  it('dos altas a la vez con el mismo nombre: entra una sola, la otra recibe 409', async () => {
    // Es el caso que el parche de SPEC-ALE186-011 dejaba pasar: las dos sentencias
    // miraban "¿hay otra con este nombre?" antes de que la otra confirmara.
    const admin = await unAdmin();
    const nombre = `Simultánea ${randomUUID().slice(0, 8)}`;
    const altas = [cuerpoDeSucursal({ nombre }), cuerpoDeSucursal({ nombre: ` ${nombre.toUpperCase()}` })];

    const respuestas = await Promise.all(altas.map((cuerpo) => testApi().post('/api/sucursales').set(admin).send(cuerpo)));

    expect(respuestas.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((res) => res.status === 409)?.body.error.codigo).toBe('NOMBRE_SUCURSAL_DUPLICADO');
    expect(await contar('SELECT count(*) FROM sucursales WHERE lower(btrim(nombre)) = lower($1)', [nombre])).toBe(1);
  });

  it('el reintento de un alta (mismo id y nombre) sigue respondiendo 200', async () => {
    const admin = await unAdmin();
    const cuerpo = cuerpoDeSucursal();
    await testApi().post('/api/sucursales').set(admin).send(cuerpo);

    const reintento = await testApi().post('/api/sucursales').set(admin).send(cuerpo);

    expect(reintento.status).toBe(200);
  });
});

describe('cerrada_en la pone la misma sentencia que cierra — SPEC-ALE186-020', () => {
  it('al cerrar queda la hora del cierre; al reabrir se borra', async () => {
    const admin = await unAdmin();
    const { sucursalId } = await escenario();
    const activa = (valor: boolean) => testApi().patch(`/api/sucursales/${sucursalId}`).set(admin).send({ activa: valor });

    expect(await cerradaEn(sucursalId)).toBeNull();
    expect((await activa(false)).status).toBe(200);
    expect(await cerradaEn(sucursalId)).not.toBeNull();
    expect((await activa(true)).status).toBe(200);
    expect(await cerradaEn(sucursalId)).toBeNull();
  });

  it('"cerrar" una que ya estaba cerrada no le corre la fecha', async () => {
    // Correrla haría la regla más permisiva: entraría ropa de entre los dos "cierres".
    const admin = await unAdmin();
    const { sucursalId } = await escenario();
    const cerrar = () => testApi().patch(`/api/sucursales/${sucursalId}`).set(admin).send({ activa: false });
    await cerrar();
    const primera = await cerradaEn(sucursalId);

    expect((await cerrar()).status).toBe(200);
    expect(await cerradaEn(sucursalId)).toBe(primera);
  });

  it('una cerrada sin fecha conocida no acepta ropa, ni siquiera de hace un año', async () => {
    // Es lo que deja la migración 002 para una sucursal cerrada sin rastro en la
    // auditoría: no se puede saber qué fue "antes del cierre", así que no entra nada.
    const esc = await escenario();
    await pool.query('UPDATE sucursales SET activa = false, cerrada_en = NULL WHERE id = $1', [esc.sucursalId]);
    const haceUnAnio = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const res = await testApi()
      .post('/api/ordenes')
      .set(conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId }))
      .send(cuerpoDeOrden({ cliente_id: esc.clienteId, numero_boleta: `N-${randomUUID().slice(0, 6)}`, fecha_entrada: haceUnAnio }));

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('SUCURSAL_CERRADA');
  });
});
