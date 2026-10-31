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
//   crearOrden(esc, {...})  Una orden de ese escenario (por defecto RECIBIDO, de
//                           Bs 45,50). Se retoca solo lo que el test necesita.
//   crearPago(orden, esc, {...}) / crearEntrega(orden, esc, {...})
//                           (devuelven el id de lo que crean: SPEC-KRILINXI-062, para anotarle auditoría)
//                           (`sinBoleta: {nombre, carnet}` en el retiro: SPEC-KRILINXI-060)
//                           Un cobro o un retiro con la fecha que el test elija
//                           (ISO con zona, como la manda el dispositivo) —
//                           SPEC-ALE186-008, para las estadísticas.
//   pagarOrden(orden, esc, monto?) Cobra la orden por completo (o por `monto`): desde SPEC-KRILINXI-056 la ropa solo se entrega con la
//                           boleta pagada, así que un test que entrega por el model paga antes.
//   crearRenglon(orden, {...}) Un renglón de la boleta escrito directo, sin la regla del total — SPEC-KRILINXI-068
//                           (devuelve su id). Para preparar una orden con renglones; lo que prueba la regla va por el model.
//   crearSucursal() / crearUsuario() / crearCliente()
//                           Las piezas sueltas, para armar casos con dos
//                           sucursales o un ADMIN.
//   mientrasSeAnula(id, fn) Abre una anulación de la orden SIN confirmar en otra
//                           conexión, corre `fn` y dice si `fn` tuvo que esperar.
//                           Es la carrera que pagos y entregas tienen que aguantar.
//   leerOrden(id) / contar(sql, valores)
//                           Para comprobar cómo quedó la base después.
//   auditoriaDe(registroId) Las filas de `auditoria` de un registro, en orden —
//                           SPEC-ALE186-010.
//   anotarAuditoria({...})  Una fila de `auditoria` con la fecha que el test elija
//                           (ISO con zona), para probar la consulta por períodos
//                           y la paginación — SPEC-ALE186-012.
//   ahoraEnLaBase(ms)       La hora de POSTGRES (no la de Node) corrida `ms`
//                           milisegundos, en ISO: para comparar con fechas que
//                           pone la base, como la del cierre — SPEC-ALE186-014.
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
import type { EstadoOrden, MetodoPago, MomentoItem, TipoPago } from '../../src/utils/dominio.js';

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

/**
 * Un cliente. Sin campos: "Cliente de prueba" y 8 dígitos al azar (el teléfono es
 * único en todo el sistema). Con `nombre` o `telefono` —SPEC-KRILINXI-040, para
 * probar la búsqueda por texto— se eligen; el que falte sigue siendo el de siempre.
 */
export async function crearCliente(campos: { nombre?: string; telefono?: string } = {}): Promise<string> {
  const id = randomUUID();
  const telefono = campos.telefono ?? String(Math.floor(10_000_000 + Math.random() * 89_999_999));
  await pool.query('INSERT INTO clientes (id, nombre, telefono) VALUES ($1, $2, $3)', [
    id,
    campos.nombre ?? 'Cliente de prueba',
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
  campos: {
    estado?: EstadoOrden;
    precioTotal?: string;
    sucursalId?: string;
    /** ISO 8601 con zona, como la manda el dispositivo; sin esto, ahora. */
    fechaEntrada?: string;
  } = {},
): Promise<OrdenCreada> {
  const id = randomUUID();
  const numeroBoleta = `B-${unico()}`;
  // La fecha pasa por `timestamptz` igual que en el model de órdenes, para que
  // quede guardada en la misma hora de referencia que el resto de las filas.
  await pool.query(
    `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id,
                          descripcion, precio_total, estado, fecha_entrada)
     VALUES ($1, $2, $3, $4, $5, 'Ropa de prueba', $6, $7,
             COALESCE($8::timestamptz::timestamp, LOCALTIMESTAMP))`,
    [
      id,
      numeroBoleta,
      esc.clienteId,
      campos.sucursalId ?? esc.sucursalId,
      esc.usuarioId,
      campos.precioTotal ?? '45.50',
      campos.estado ?? 'RECIBIDO',
      campos.fechaEntrada ?? null,
    ],
  );
  return { id, numeroBoleta };
}

/** Un cobro de la orden, en la sucursal de la orden. */
export async function crearPago(
  orden: OrdenCreada,
  esc: Escenario,
  campos: { monto: string; metodo?: MetodoPago; tipo?: TipoPago; fechaPago?: string },
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo, usuario_id, fecha_pago)
     SELECT $1, o.id, o.sucursal_id, $3, $4, $5, $6, COALESCE($7::timestamptz::timestamp, LOCALTIMESTAMP)
       FROM ordenes o WHERE o.id = $2`,
    [
      id,
      orden.id,
      campos.monto,
      campos.tipo ?? 'ADELANTO',
      campos.metodo ?? 'EFECTIVO',
      esc.usuarioId,
      campos.fechaPago ?? null,
    ],
  );
  return id;
}

/** Cobra la orden por completo (su precio_total) o por `monto`, como pago final en efectivo — SPEC-KRILINXI-056. */
export async function pagarOrden(orden: OrdenCreada, esc: Escenario, monto?: string): Promise<void> {
  await pool.query(
    `INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo, usuario_id)
     SELECT $1, o.id, o.sucursal_id, COALESCE($3::numeric, o.precio_total), 'PAGO_FINAL', 'EFECTIVO', $4
       FROM ordenes o WHERE o.id = $2`,
    [randomUUID(), orden.id, monto ?? null, esc.usuarioId],
  );
}

/**
 * Un renglón de la boleta, en la sucursal de la orden — SPEC-KRILINXI-068. Va directo a la tabla, sin la regla del
 * total que aplica el model: sirve para preparar el caso, no para probar la regla.
 */
export async function crearRenglon(
  orden: OrdenCreada,
  campos: { cantidad?: string; precioUnitario: string; momento?: MomentoItem; posicion?: number; descripcion?: string },
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO orden_items (id, orden_id, sucursal_id, momento, posicion, descripcion, cantidad, precio_unitario)
     SELECT $1, o.id, o.sucursal_id, $3, $4, $5, $6, $7 FROM ordenes o WHERE o.id = $2`,
    [
      id,
      orden.id,
      campos.momento ?? 'INGRESO',
      campos.posicion ?? 0,
      campos.descripcion ?? 'Camisa',
      campos.cantidad ?? '1',
      campos.precioUnitario,
    ],
  );
  return id;
}

/** El retiro de la orden: la deja ENTREGADO, como hace el model de entregas. */
export async function crearEntrega(
  orden: OrdenCreada,
  esc: Escenario,
  campos: { precioFinal: string; sinBoleta?: { nombre: string; carnet: string } },
): Promise<string> {
  // SPEC-KRILINXI-060: `sinBoleta` registra el retiro SIN_BOLETA con quien lo hizo.
  const { sinBoleta } = campos;
  const id = randomUUID();
  await pool.query(
    `WITH o AS (UPDATE ordenes SET estado = 'ENTREGADO' WHERE id = $2 RETURNING id, sucursal_id)
     INSERT INTO entregas (id, orden_id, sucursal_id, tipo_retiro, retirado_por_nombre, retirado_por_carnet,
                           usuario_entrega_id, precio_final)
     SELECT $1, o.id, o.sucursal_id, $5::tipo_retiro, $6, $7, $3, $4 FROM o`,
    [
      id,
      orden.id,
      esc.usuarioId,
      campos.precioFinal,
      sinBoleta ? 'SIN_BOLETA' : 'CON_BOLETA',
      sinBoleta?.nombre ?? null,
      sinBoleta?.carnet ?? null,
    ],
  );
  return id;
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

export interface FilaAuditoria {
  usuarioId: string;
  accion: string;
  tablaAfectada: string;
  /** El JSONB tal cual lo devuelve `pg`, ya parseado; `null` si no hay. */
  valoresAnteriores: Record<string, unknown> | null;
}

/** Lo que quedó anotado en `auditoria` sobre un registro, del más viejo al más nuevo. */
export async function auditoriaDe(registroId: string): Promise<FilaAuditoria[]> {
  const { rows } = await pool.query<{
    usuario_id: string;
    accion: string;
    tabla_afectada: string;
    valores_anteriores: Record<string, unknown> | null;
  }>(
    `SELECT usuario_id, accion, tabla_afectada, valores_anteriores
       FROM auditoria WHERE registro_id = $1 ORDER BY fecha, accion`,
    [registroId],
  );
  return rows.map((fila) => ({
    usuarioId: fila.usuario_id,
    accion: fila.accion,
    tablaAfectada: fila.tabla_afectada,
    valoresAnteriores: fila.valores_anteriores,
  }));
}

/**
 * Una fila de auditoría escrita directo, sin pasar por una escritura del
 * negocio: para cuando el test necesita elegir la fecha. Pasa por `timestamptz`
 * igual que las fechas del dispositivo, así queda en la misma hora de
 * referencia que las filas que escribe el backend.
 */
export async function anotarAuditoria(campos: {
  usuarioId: string;
  fecha: string;
  accion?: string;
  tabla?: string;
  registroId?: string;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO auditoria (id, usuario_id, accion, tabla_afectada, registro_id, fecha)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz::timestamp)`,
    [id, campos.usuarioId, campos.accion ?? 'LOGIN', campos.tabla ?? 'usuarios', campos.registroId ?? null, campos.fecha],
  );
  return id;
}

/**
 * La hora de la base, corrida `desplazamientoMs`, en ISO con zona.
 *
 * Para los tests que comparan una fecha armada en el test con otra que puso
 * Postgres (`now()`, `DEFAULT NOW()` de la auditoría). En Windows, Postgres
 * corre en la VM de Docker, cuyo reloj puede desviarse unos segundos del de la
 * máquina: "un minuto después" calculado con el reloj de Node podría caer antes.
 */
export async function ahoraEnLaBase(desplazamientoMs = 0): Promise<string> {
  const { rows } = await pool.query<{ ahora: Date }>('SELECT now() AS ahora');
  const ahora = rows[0]?.ahora ?? new Date();
  return new Date(ahora.getTime() + desplazamientoMs).toISOString();
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
