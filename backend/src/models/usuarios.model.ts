// Model de usuarios: el único sitio que consulta la tabla `usuarios`.
//
// Recibe argumentos y devuelve datos; no conoce `req` ni `res` (CLAUDE.md,
// sección 5). Acá también se hace la traducción snake_case → camelCase de la
// sección 10: la base habla en snake_case y el resto del backend en camelCase,
// y la frontera entre los dos está en este archivo y en ningún otro.
import { pool } from '../db/pool.js';
import type { Rol } from '../utils/jwt.js';

export interface Usuario {
  id: string;
  nombreCompleto: string;
  username: string;
  rol: Rol;
  sucursalId: string | null;
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
    activo: fila.activo,
  };
}

// Las columnas se listan una por una, nunca `SELECT *`. No es estilo: es que
// `password_hash` está en esa tabla, y un `*` la arrastraría a cualquier sitio
// que reenvíe lo que devuelve el model.
const COLUMNAS = 'id, nombre_completo, username, rol, sucursal_id, activo';

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
