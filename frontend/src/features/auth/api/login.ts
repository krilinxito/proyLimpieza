import { api } from '../../../lib/api';
import { conHoraDelServidor } from '../../../lib/reloj';
import { esSesion, type Sesion } from '../types';

/**
 * POST /api/auth/login (SPEC-ALE186-002).
 *
 * Los errores llegan ya traducidos por `lib/api`: `ErrorApi` con el mensaje del servidor, o
 * `ErrorSinConexion`. Aquí solo se comprueba que lo que volvió tiene la forma esperada.
 * De paso, la respuesta trae la hora del servidor y con ella se corrige el reloj de la
 * tablet (SPEC-KRILINXI-012).
 */
export async function login(username: string, password: string): Promise<Sesion> {
  const data = await conHoraDelServidor(async () => (await api.post<unknown>('/auth/login', { username, password })).data);
  if (!esSesion(data)) {
    throw new Error('El servidor respondió algo que no se entiende. Avisale al encargado.');
  }
  return data;
}
