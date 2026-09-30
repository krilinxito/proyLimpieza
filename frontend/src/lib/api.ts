/**
 * El cliente de la API: el único sitio del frontend que habla HTTP con el backend.
 *
 * Tres trabajos, y por eso vive en un solo lugar:
 *
 *  1. Saber dónde está el servidor (`VITE_API_URL`, vía `lib/env`).
 *  2. Poner el token en cada petición, si hay sesión.
 *  3. Traducir lo que sale mal a dos errores propios: `ErrorApi` (el servidor respondió que
 *     no) y `ErrorSinConexion` (no hubo respuesta). Las features tratan esos dos y nunca
 *     tienen que saber que por debajo hay axios.
 *
 * Qué NO hace: guardar la sesión. No sabe dónde vive ni cómo se borra; se la presta quien
 * la tiene, con `conectarSesion`. Así `lib/` no depende de `features/`.
 */
import axios, { type AxiosInstance } from 'axios';
import { entorno } from './env';

/** El servidor respondió con un error. `mensaje` está escrito para el mostrador. */
export class ErrorApi extends Error {
  readonly status: number;
  /** Estable y en mayúsculas (`NO_AUTENTICADO`, `TELEFONO_DUPLICADO`): para el código, no para la pantalla. */
  readonly codigo: string;

  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.codigo = codigo;
  }
}

/** La petición no llegó a tener respuesta: sin internet, servidor caído o demasiado lento. */
export class ErrorSinConexion extends Error {
  constructor() {
    super('No hay conexión con el servidor.');
    this.name = 'ErrorSinConexion';
  }
}

// Para cuando el servidor responde algo que no es nuestro formato de error: un proxy
// caído que devuelve HTML, por ejemplo.
const ERROR_DESCONOCIDO = 'El servidor tuvo un problema. Probá de nuevo en un momento.';

type ConexionSesion = {
  /** El token de la API, o null si no hay sesión. Se consulta en cada petición. */
  obtenerToken: () => string | null;
  /** El servidor dijo que ese token ya no vale: hay que olvidar la sesión. */
  alRechazarSesion: () => void;
};

const SIN_SESION: ConexionSesion = { obtenerToken: () => null, alRechazarSesion: () => {} };
let sesion: ConexionSesion = SIN_SESION;

/**
 * Presta la sesión al cliente. Devuelve la función que la desconecta, lista para usarse
 * como limpieza de un `useEffect`.
 */
export function conectarSesion(conexion: ConexionSesion): () => void {
  sesion = conexion;
  return () => {
    if (sesion === conexion) sesion = SIN_SESION;
  };
}

export const api: AxiosInstance = axios.create({
  baseURL: `${entorno.apiUrl}/api`,
  // Sin límite, un wifi que no responde deja el botón "Entrando…" colgado para siempre.
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = sesion.obtenerToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

api.interceptors.response.use(
  (respuesta) => respuesta,
  (error: unknown) => Promise.reject(traducirError(error)),
);

/** `{ error: { codigo, mensaje } }`: el formato de error uniforme del backend (CLAUDE.md §10). */
function leerCuerpoError(datos: unknown): { codigo: string; mensaje: string } | null {
  if (typeof datos !== 'object' || datos === null || !('error' in datos)) return null;
  const { error } = datos;
  if (typeof error !== 'object' || error === null) return null;
  if (!('codigo' in error) || typeof error.codigo !== 'string') return null;
  if (!('mensaje' in error) || typeof error.mensaje !== 'string') return null;
  return { codigo: error.codigo, mensaje: error.mensaje };
}

function traducirError(error: unknown): Error {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error : new Error(String(error));

  const respuesta = error.response;
  if (!respuesta) return new ErrorSinConexion();

  // Un 401 al login es "contraseña incorrecta", no "tu sesión se venció": solo cuenta como
  // sesión rechazada si la petición llevaba token.
  const llevabaToken = Boolean(error.config?.headers.get('Authorization'));
  if (respuesta.status === 401 && llevabaToken) sesion.alRechazarSesion();

  const cuerpo = leerCuerpoError(respuesta.data);
  return cuerpo
    ? new ErrorApi(respuesta.status, cuerpo.codigo, cuerpo.mensaje)
    : new ErrorApi(respuesta.status, 'ERROR_INTERNO', ERROR_DESCONOCIDO);
}
