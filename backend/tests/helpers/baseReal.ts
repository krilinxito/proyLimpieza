// Datos de verdad en la base de pruebas — creado en SPEC-ALE186-007.
//
// Para los tests de `tests/db/` (suite `npm run test:db`), que corren contra el
// Postgres de Docker. Los de `tests/http` y `tests/unit` NO usan esto: siguen con
// las factories en memoria (`ordenes.ts`, `pagos.ts`…) y un doble del pool.
//
// Qué cubre:
//
//   escenario()             Una sucursal, un empleado de esa sucursal y un
//                           cliente, en una línea. Es el punto de partida de
//                           casi todo test: una orden necesita los tres.
//   crearOrden(esc, {...})  Una orden de ese escenario (por defecto LISTO, de
//                           Bs 45,50). Se retoca solo lo que el test necesita.
//   crearSucursal() / crearUsuario() / crearCliente()
//                           Las piezas sueltas, para armar casos con dos
//                           sucursales o un ADMIN.
//   mientrasSeAnula(id, fn) Abre una anulación de la orden SIN confirmar en otra
//                           conexión, corre `fn` y dice si `fn` tuvo que esperar.
//                           Es la carrera que pagos y entregas tienen que aguantar.
//   leerOrden(id) / contar(sql, valores)
//                           Para comprobar cómo quedó la base después.
//
// Todo se crea con ids y valores únicos nuevos (teléfono, boleta, usuario), así
// que los tests no chocan entre sí aunque corran en paralelo, y no hace falta
// limpiar nada: la base de pruebas se recrea entera en cada corrida.
//
//   const esc = await escenario();
//   const orden = await crearOrden(esc, { estado: 'ANULADO' });
//   const resultado = await pagos.crear({ ...}, { sucursalId: esc.sucursalId });
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/db/pool.js';
import type { EstadoOrden } from '../../src/utils/dominio.js';

/** Un sufijo corto y único, para los campos que la base exige únicos. */
function unico(): string {
  return randomUUID().slice(0, 8);
}

export async function crearSucursal(): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO sucursales (id, nombre) VALUES ($1, $2)', [id, `Sucursal ${unico()}`]);
  return id;
}

export async function crearUsuario(
  campos: { sucursalId: string | null; rol?: 'ADMIN' | 'EMPLEADO' },
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO usuarios (id, sucursal_id, nombre_completo, username, password_hash, rol)
     VALUES ($1, $2, 'Usuario de prueba', $3, 'sin-hash-en-pruebas', $4)`,
    [id, campos.sucursalId, `prueba_${unico()}`, campos.rol ?? 'EMPLEADO'],
  );
  return id;
}

export async function crearCliente(): Promise<string> {
  const id = randomUUID();
  // 8 dígitos al azar: el teléfono es único en todo el sistema.
  const telefono = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
  await pool.query('INSERT INTO clientes (id, nombre, telefono) VALUES ($1, $2, $3)', [
    id,
    'Cliente de prueba',
    telefono,
  ]);
  return id;
}

export interface Escenario {
  sucursalId: string;
  usuarioId: string;
  clienteId: string;
}

/** Sucursal + empleado de esa sucursal + cliente. */
export async function escenario(): Promise<Escenario> {
  const sucursalId = await crearSucursal();
  const [usuarioId, clienteId] = await Promise.all([crearUsuario({ sucursalId }), crearCliente()]);
  return { sucursalId, usuarioId, clienteId };
}

export interface OrdenCreada {
  id: string;
  numeroBoleta: string;
}

export async function crearOrden(
  esc: Escenario,
  campos: { estado?: EstadoOrden; precioTotal?: string; sucursalId?: string } = {},
): Promise<OrdenCreada> {
  const id = randomUUID();
  const numeroBoleta = `B-${unico()}`;
  await pool.query(
    `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id,
                          descripcion, precio_total, estado)
     VALUES ($1, $2, $3, $4, $5, 'Ropa de prueba', $6, $7)`,
    [
      id,
      numeroBoleta,
      esc.clienteId,
      campos.sucursalId ?? esc.sucursalId,
      esc.usuarioId,
      campos.precioTotal ?? '45.50',
      campos.estado ?? 'LISTO',
    ],
  );
  return { id, numeroBoleta };
}

export async function leerOrden(id: string): Promise<{ estado: EstadoOrden; sucursalId: string }> {
  const { rows } = await pool.query<{ estado: EstadoOrden; sucursal_id: string }>(
    'SELECT estado, sucursal_id FROM ordenes WHERE id = $1',
    [id],
  );
  const fila = rows[0];
  if (fila === undefined) throw new Error(`La orden ${id} no existe en la base de pruebas.`);
  return { estado: fila.estado, sucursalId: fila.sucursal_id };
}

/** `SELECT count(*) …` como número. */
export async function contar(sql: string, valores: unknown[]): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(sql, valores);
  return Number(rows[0]?.count ?? 0);
}

/** Cuánto se espera para decidir que `fn` quedó bloqueada por la anulación. */
const ESPERA_PARA_DECIDIR_MS = 500;

/**
 * Corre `fn` mientras otra conexión tiene abierta —sin confirmar— la anulación
 * de la orden, y después confirma la anulación.
 *
 * Devuelve lo que devolvió `fn` y si tuvo que esperar. "Esperar" es lo correcto:
 * significa que `fn` encontró la fila bloqueada y no siguió con el estado viejo.
 * Si `fn` termina antes de que se confirme la anulación, leyó la orden como si
 * no se estuviera anulando, y esa es la carrera que se quiere evitar.
 */
export async function mientrasSeAnula<T>(
  ordenId: string,
  fn: () => Promise<T>,
): Promise<{ resultado: T; espero: boolean }> {
  const anulador = await pool.connect();
  try {
    await anulador.query('BEGIN');
    await anulador.query(`UPDATE ordenes SET estado = 'ANULADO' WHERE id = $1`, [ordenId]);

    let termino = false;
    const enCurso = fn().finally(() => {
      termino = true;
    });
    // Si `fn` falla mientras se espera, el error llega igual en el `await` de
    // abajo; esto solo evita que Node lo reporte antes como "sin manejar".
    enCurso.catch(() => undefined);

    await new Promise((resolver) => setTimeout(resolver, ESPERA_PARA_DECIDIR_MS));
    const espero = !termino;

    await anulador.query('COMMIT');
    return { resultado: await enCurso, espero };
  } catch (error) {
    await anulador.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    anulador.release();
  }
}
