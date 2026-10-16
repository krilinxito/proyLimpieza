import { api } from '../../../lib/api';
import { esSesion, type Sesion } from '../types';

/**
 * POST /api/auth/renovar (SPEC-ALE186-002) — SPEC-KRILINXI-010.
 *
 * Se presenta con el token de la API, que pone `lib/api` como en cualquier otra petición, y
 * vuelve con un par nuevo y el usuario releído (por si le cambiaron la sucursal). Si responde
 * 401, `lib/api` ya avisó a la sesión que la rechazaron: aquí no hay que hacer nada más.
 */
export async function renovar(): Promise<Sesion> {
  const { data } = await api.post<unknown>('/auth/renovar');
  if (!esSesion(data)) {
    throw new Error('El servidor respondió algo que no se entiende. Avisale al encargado.');
  }
  return data;
}
