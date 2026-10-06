// Model de usuarios: el único sitio que consulta la tabla `usuarios`.
//
// Recibe argumentos y devuelve datos; no conoce `req` ni `res` (CLAUDE.md,
// sección 5). Acá también se hace la traducción snake_case → camelCase de la
// sección 10: la base habla en snake_case y el resto del backend en camelCase,
// y la frontera entre los dos está en este archivo y en ningún otro.
import pg from 'pg';
import { pool } from '../db/pool.js';
import type { Rol } from '../utils/jwt.js';
import { conAuditoria, updateConAntes } from './auditoria.model.js';

export interface Usuario {
  id: string;
  nombreCompleto: string;
  username: string;
  rol: Rol;
  sucursalId: string | null;
  telefono: string | null;
  activo: boolean;
}

/**
 * Un usuario con su hash. Existe solo para el login.
 *
 * Es un tipo aparte y no un campo opcional de `Usuario` a propósito: así, para
 * tener el hash en las manos, hay que haber llamado a la función que lo trae, y
 * no puede colarse sin querer en una respuesta.
 */
export interface UsuarioConHash extends Usuario {
  passwordHash: string;
}

/** La fila tal cual la devuelve Postgres. */
interface FilaUsuario {
  id: string;
  nombre_completo: string;
  username: string;
  rol: string;
  sucursal_id: string | null;
  telefono: string | null;
  activo: boolean;
  password_hash?: string;
}

// La columna es del tipo ENUM `rol_usuario`, así que la base ya garantiza los
// valores. Se comprueba igual porque `pg` los entrega como string: sin esto
// habría que afirmar el tipo con un `as`, que es justo lo que la sección 10
// prohíbe. Si algún día el ENUM crece, esto avisa en vez de propagar el valor
// nuevo disfrazado de rol conocido.
function aRol(valor: string): Rol {
  if (valor !== 'ADMIN' && valor !== 'EMPLEADO') {
    throw new Error(`La base devolvió el rol desconocido "${valor}".`);
  }
  return valor;
}

function aUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    nombreCompleto: fila.nombre_completo,
    username: fila.username,
    rol: aRol(fila.rol),
    sucursalId: fila.sucursal_id,
    telefono: fila.telefono,
    activo: fila.activo,
  };
}

// Las columnas se listan una por una, nunca `SELECT *`. No es estilo: es que
// `password_hash` está en esa tabla, y un `*` la arrastraría a cualquier sitio
// que reenvíe lo que devuelve el model.
const COLUMNAS = 'id, nombre_completo, username, rol, sucursal_id, telefono, activo';

/**
 * Busca por username para el login. Es el ÚNICO lugar que trae el hash.
 *
 * El valor va como parámetro `$1` y nunca concatenado (sección 5): con
 * concatenación, un username como `' OR 1=1 --` cambiaría la consulta.
 */
export async function buscarPorUsername(username: string): Promise<UsuarioConHash | null> {
  const { rows } = await pool.query<FilaUsuario>(
    `SELECT ${COLUMNAS}, password_hash FROM usuarios WHERE username = $1`,
    [username],
  );

  const fila = rows[0];
  if (fila === undefined || fila.password_hash === undefined) return null;

  return { ...aUsuario(fila), passwordHash: fila.password_hash };
}

/**
 * Busca por id, sin el hash.
 *
 * Es lo que usa la renovación del token: el `activo` que vale es el de la base
 * ahora, no el que era cierto cuando se emitió el token hace tres días.
 */
export async function buscarPorId(id: string): Promise<Usuario | null> {
  const { rows } = await pool.query<FilaUsuario>(
    `SELECT ${COLUMNAS} FROM usuarios WHERE id = $1`,
    [id],
  );

  const fila = rows[0];
  return fila === undefined ? null : aUsuario(fila);
}

export interface UsuarioNuevo {
  nombreCompleto: string;
  username: string;
  passwordHash: string;
  rol: Rol;
  sucursalId: string | null;
}

/**
 * Crea un usuario, o no hace nada si el username ya existe.
 *
 * Es el de la semilla, y NO se audita (SPEC-ALE186-010): el primer admin no lo
 * crea nadie con sesión, y `auditoria.usuario_id` no admite NULL.
 *
 * Devuelve `null` en ese segundo caso, y de ahí sale la idempotencia de la
 * semilla: la unicidad la decide la base con su restricción `UNIQUE`, no una
 * consulta previa nuestra. Comprobar y después insertar son dos pasos, y entre
 * los dos cabe otro proceso haciendo lo mismo.
 */
export async function crear(usuario: UsuarioNuevo): Promise<Usuario | null> {
  const { rows } = await pool.query<FilaUsuario>(
    `INSERT INTO usuarios (nombre_completo, username, password_hash, rol, sucursal_id)
          VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (username) DO NOTHING
       RETURNING ${COLUMNAS}`,
    [
      usuario.nombreCompleto,
      usuario.username,
      usuario.passwordHash,
      usuario.rol,
      usuario.sucursalId,
    ],
  );

  const fila = rows[0];
  return fila === undefined ? null : aUsuario(fila);
}

// ------------------------------------------------------------------
//  Alta y edición desde la API — SPEC-ALE186-009
// ------------------------------------------------------------------

/**
 * El username ya es de otra cuenta.
 *
 * Error de dominio, no `ApiError`: el model no sabe de HTTP (sección 5). Que
 * esto sea un 409, y con qué mensaje, lo decide el controller.
 */
export class UsernameOcupadoError extends Error {
  constructor(readonly username: string) {
    super(`El username ${username} ya pertenece a otra cuenta.`);
    this.name = 'UsernameOcupadoError';
  }
}

// El nombre que Postgres le pone solo al `username ... UNIQUE` del schema.
const RESTRICCION_USERNAME = 'usuarios_username_key';

async function conUsernameUnico<T>(username: string, operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    // 23505 = unique_violation. Se mira la restricción, no el texto del mensaje,
    // igual que en clientes: el texto depende del idioma del servidor.
    if (
      error instanceof pg.DatabaseError &&
      error.code === '23505' &&
      error.constraint === RESTRICCION_USERNAME
    ) {
      throw new UsernameOcupadoError(username);
    }
    throw error;
  }
}

export interface UsuarioRegistrado {
  id: string;
  nombreCompleto: string;
  username: string;
  passwordHash: string;
  rol: Rol;
  sucursalId: string | null;
  telefono: string | null;
  /** El ADMIN que lo da de alta. Sale de la sesión, nunca del cuerpo. */
  creadoPor: string;
}

/**
 * Da de alta una cuenta con el id que manda el cliente, o devuelve la que ya
 * existe con ese id.
 *
 * Es el mismo patrón que `clientes.crear` (SPEC-ALE186-003): `ON CONFLICT (id)
 * DO NOTHING` arbitra SOLO sobre el id, así que un reintento no duplica y un
 * username repetido con otro id sigue tirando su error de unicidad.
 *
 * Distinto de `crear`, que es el de la semilla: aquel no recibe id y arbitra
 * por username, porque su idempotencia es "si el admin ya existe, no tocarlo".
 *
 * Lo que devuelve en el reintento es la fila guardada, sin hash. Decidir si el
 * reintento trae los MISMOS datos es del controller.
 */
export async function registrar(
  usuario: UsuarioRegistrado,
): Promise<{ usuario: Usuario; creado: boolean }> {
  // CREAR, a nombre del admin que la da de alta (SPEC-ALE186-010).
  const { sql, valores } = conAuditoria(
    {
      sql: `INSERT INTO usuarios (id, nombre_completo, username, password_hash, rol,
                                  sucursal_id, telefono, creado_por)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO NOTHING
              RETURNING ${COLUMNAS}`,
      valores: [
        usuario.id,
        usuario.nombreCompleto,
        usuario.username,
        usuario.passwordHash,
        usuario.rol,
        usuario.sucursalId,
        usuario.telefono,
        usuario.creadoPor,
      ],
      columnas: COLUMNAS,
    },
    { usuarioId: usuario.creadoPor, accion: 'CREAR', tabla: 'usuarios' },
  );
  const { rows } = await conUsernameUnico(usuario.username, () => pool.query<FilaUsuario>(sql, valores));

  const insertada = rows[0];
  if (insertada !== undefined) return { usuario: aUsuario(insertada), creado: true };

  const existente = await buscarPorId(usuario.id);
  if (existente === null) {
    // Chocó por id y el id no está: no hay borrado de usuarios, así que esto
    // no debería pasar nunca. Mejor enterarse que inventar una respuesta.
    throw new Error(`El usuario ${usuario.id} chocó por id pero no se encuentra.`);
  }
  return { usuario: existente, creado: false };
}

/** Lo único de una cuenta que se puede cambiar. El rol y el username, no. */
export interface CambiosUsuario {
  nombreCompleto?: string;
  telefono?: string | null;
  sucursalId?: string | null;
  passwordHash?: string;
  activo?: boolean;
}

// Campo de TypeScript → columna. Lista cerrada: las columnas del UPDATE salen
// SOLO de acá, nunca del cuerpo de la petición.
const COLUMNA_EDITABLE: Record<keyof CambiosUsuario, string> = {
  nombreCompleto: 'nombre_completo',
  telefono: 'telefono',
  sucursalId: 'sucursal_id',
  passwordHash: 'password_hash',
  activo: 'activo',
};

/**
 * Aplica los cambios y devuelve la cuenta, o `null` si no existe.
 *
 * Escribe el hash pero no lo devuelve: el `RETURNING` usa las mismas columnas
 * sin hash que todo lo demás. Tampoco lo copia a la auditoría: ahí queda
 * `contrasena_cambiada: true` (SPEC-ALE186-010).
 */
export async function actualizar(
  id: string,
  cambios: CambiosUsuario,
  autorId: string,
): Promise<Usuario | null> {
  const campos = (Object.keys(COLUMNA_EDITABLE) as (keyof CambiosUsuario)[]).filter(
    (campo) => cambios[campo] !== undefined,
  );

  if (campos.length === 0) return buscarPorId(id);

  const { sql, valores } = conAuditoria(
    {
      sql: updateConAntes({
        tabla: 'usuarios',
        asignaciones: campos.map((campo, i) => `${COLUMNA_EDITABLE[campo]} = $${i + 2}`),
        condiciones: 'id = $1',
        columnas: COLUMNAS,
        // De la contraseña se anota que cambió, nunca el hash de antes.
        auditadas: campos.map((campo) =>
          campo === 'passwordHash'
            ? { columna: COLUMNA_EDITABLE[campo], soloMarca: 'contrasena_cambiada' }
            : { columna: COLUMNA_EDITABLE[campo] },
        ),
      }),
      valores: [id, ...campos.map((campo) => cambios[campo])],
      columnas: COLUMNAS,
    },
    { usuarioId: autorId, accion: 'EDITAR', tabla: 'usuarios', conValoresAnteriores: true },
  );

  const { rows } = await pool.query<FilaUsuario>(sql, valores);

  const fila = rows[0];
  return fila === undefined ? null : aUsuario(fila);
}
