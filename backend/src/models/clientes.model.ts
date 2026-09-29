// Model de clientes: el único sitio que consulta la tabla `clientes`.
//
// Es el primer model que ESCRIBE datos que vienen del dispositivo, y fija dos
// reglas que van a copiar órdenes, pagos y entregas (CLAUDE.md, sección 6):
//
//   1. El id lo genera el dispositivo. Acá se inserta tal cual llega.
//   2. La misma escritura puede llegar dos veces: si la conexión se corta a
//      mitad de la subida, PowerSync la reintenta. Un reintento no duplica.
import pg from 'pg';
import { pool } from '../db/pool.js';

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  carnet: string | null;
  fechaRegistro: string;
  sucursalRegistroId: string | null;
}

interface FilaCliente {
  id: string;
  nombre: string;
  telefono: string;
  carnet: string | null;
  fecha_registro: string;
  sucursal_registro_id: string | null;
}

function aCliente(fila: FilaCliente): Cliente {
  return {
    id: fila.id,
    nombre: fila.nombre,
    telefono: fila.telefono,
    carnet: fila.carnet,
    fechaRegistro: fila.fecha_registro,
    sucursalRegistroId: fila.sucursal_registro_id,
  };
}

const COLUMNAS = 'id, nombre, telefono, carnet, fecha_registro, sucursal_registro_id';

/**
 * El teléfono ya es de otro cliente.
 *
 * Es un error de dominio y no un `ApiError`: el model no sabe de HTTP (sección
 * 5). Quien decide que esto es un 409, y con qué mensaje, es el controller.
 */
export class TelefonoOcupadoError extends Error {
  constructor(readonly telefono: string) {
    super(`El teléfono ${telefono} ya pertenece a otro cliente.`);
    this.name = 'TelefonoOcupadoError';
  }
}

// El nombre que Postgres le pone solo a la restricción de `telefono ... UNIQUE`
// del schema. Si algún día se le pone un nombre explícito, hay que cambiarlo acá.
const RESTRICCION_TELEFONO = 'clientes_telefono_key';

// 23505 = unique_violation. Los errores de Postgres llegan con un código de
// cinco caracteres; mirar el código y la restricción es la única forma fiable
// de saber qué falló, porque el texto del mensaje depende del idioma del servidor.
function esTelefonoRepetido(error: unknown): boolean {
  return (
    error instanceof pg.DatabaseError &&
    error.code === '23505' &&
    error.constraint === RESTRICCION_TELEFONO
  );
}

async function conTelefonoUnico<T>(telefono: string, operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    if (esTelefonoRepetido(error)) throw new TelefonoOcupadoError(telefono);
    throw error;
  }
}

export async function buscarPorId(id: string): Promise<Cliente | null> {
  const { rows } = await pool.query<FilaCliente>(
    `SELECT ${COLUMNAS} FROM clientes WHERE id = $1`,
    [id],
  );
  const fila = rows[0];
  return fila === undefined ? null : aCliente(fila);
}

export async function buscarPorTelefono(telefono: string): Promise<Cliente | null> {
  const { rows } = await pool.query<FilaCliente>(
    `SELECT ${COLUMNAS} FROM clientes WHERE telefono = $1`,
    [telefono],
  );
  const fila = rows[0];
  return fila === undefined ? null : aCliente(fila);
}

export interface ClienteNuevo {
  id: string;
  nombre: string;
  telefono: string;
  carnet: string | null;
  sucursalRegistroId: string | null;
}

/**
 * Crea el cliente, o devuelve el que ya existe con ese id.
 *
 * `ON CONFLICT (id) DO NOTHING` es lo que hace idempotente el reintento: si la
 * fila ya está, Postgres no inserta y no se queja. Ojo con lo que NO cubre: solo
 * arbitra sobre el id. Un teléfono repetido con un id distinto sigue tirando su
 * error de unicidad, que es justo lo que queremos — eso no es un reintento, es
 * otro cliente con el mismo teléfono.
 *
 * Cuando ya existía se devuelve tal cual está guardado, sin pisarlo con lo que
 * llegó: un reintento trae los datos de la primera vez, y si desde entonces
 * alguien lo editó, esa edición viaja en su propio PATCH.
 */
export async function crear(
  cliente: ClienteNuevo,
): Promise<{ cliente: Cliente; creado: boolean }> {
  const { rows } = await conTelefonoUnico(cliente.telefono, () =>
    pool.query<FilaCliente>(
      `INSERT INTO clientes (id, nombre, telefono, carnet, sucursal_registro_id)
            VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING
         RETURNING ${COLUMNAS}`,
      [cliente.id, cliente.nombre, cliente.telefono, cliente.carnet, cliente.sucursalRegistroId],
    ),
  );

  const insertada = rows[0];
  if (insertada !== undefined) return { cliente: aCliente(insertada), creado: true };

  const existente = await buscarPorId(cliente.id);
  if (existente === null) {
    // No insertó por conflicto de id y ahora el id no está: alguien lo borró
    // entre las dos consultas. No hay borrado de clientes en la API, así que si
    // pasa es que algo está muy mal, y es mejor enterarse que inventar.
    throw new Error(`El cliente ${cliente.id} chocó por id pero no se encuentra.`);
  }
  return { cliente: existente, creado: false };
}

/** Lo único de un cliente que se puede cambiar. */
export interface CambiosCliente {
  nombre?: string;
  telefono?: string;
  carnet?: string | null;
}

// Nombre del campo en TypeScript → columna en la base. Es una lista cerrada a
// propósito: las columnas del UPDATE salen SOLO de acá, nunca del cuerpo de la
// petición. Así ningún campo que mande el cliente puede colarse en el SQL.
const COLUMNA_EDITABLE: Record<keyof CambiosCliente, string> = {
  nombre: 'nombre',
  telefono: 'telefono',
  carnet: 'carnet',
};

/**
 * Aplica los cambios y devuelve el cliente, o `null` si no existe.
 *
 * El UPDATE se arma según qué campos vinieron, pero sin concatenar ningún
 * valor: los nombres de columna salen de la lista cerrada de arriba y los
 * valores van siempre como `$1, $2...` (sección 5).
 */
export async function actualizar(id: string, cambios: CambiosCliente): Promise<Cliente | null> {
  const campos = (Object.keys(COLUMNA_EDITABLE) as (keyof CambiosCliente)[]).filter(
    (campo) => cambios[campo] !== undefined,
  );

  if (campos.length === 0) return buscarPorId(id);

  const asignaciones = campos.map((campo, i) => `${COLUMNA_EDITABLE[campo]} = $${i + 2}`);
  const valores = campos.map((campo) => cambios[campo]);

  const { rows } = await conTelefonoUnico(cambios.telefono ?? '', () =>
    pool.query<FilaCliente>(
      `UPDATE clientes SET ${asignaciones.join(', ')} WHERE id = $1 RETURNING ${COLUMNAS}`,
      [id, ...valores],
    ),
  );

  const fila = rows[0];
  return fila === undefined ? null : aCliente(fila);
}
