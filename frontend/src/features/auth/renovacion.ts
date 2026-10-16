/**
 * El token de PowerSync, siempre vigente — SPEC-KRILINXI-010.
 *
 * El `tokenPowerSync` dura 12 h y el de la API 3 días (CLAUDE.md §6, SPEC-ALE186-025). Cada
 * vez que PowerSync se conecta pide credenciales; si el guardado está por vencer, se cambia
 * el par entero en /renovar con el de la API, sin pedir la contraseña.
 *
 * Qué pasa cuando falla:
 *  - Sin conexión o 5xx: se lanza. PowerSync reintenta solo más tarde; la sesión y la base
 *    local no se tocan. Sin internet no hace falta ningún token.
 *  - 401: `lib/api` ya cerró la sesión como rechazada. Se devuelve null, que para PowerSync
 *    quiere decir "no hay nadie adentro".
 */
import { ErrorApi } from '../../lib/api';
import { renovar as renovarEnLaApi } from './api/renovar';
import { venceEn } from './token';
import type { Sesion } from './types';

/** Con menos que esto por delante se renueva antes de presentarse: el token no llegaría vivo. */
export const MARGEN_MS = 2 * 60 * 1000;

type Dependencias = {
  /** La sesión de ahora mismo, o null si nadie está adentro. */
  leerSesion: () => Sesion | null;
  /** Guarda la sesión renovada, como lo hace el login. */
  guardarSesion: (sesion: Sesion) => void;
  renovar?: () => Promise<Sesion>;
  ahora?: () => number;
};

export function crearRenovador({ leerSesion, guardarSesion, renovar = renovarEnLaApi, ahora = Date.now }: Dependencias) {
  // La renovación en curso. PowerSync puede pedir credenciales varias veces seguidas (al
  // reconectar, al reintentar); todas esperan la misma respuesta en vez de pedir un par cada
  // una, que además dejaría guardado uno cualquiera de los que lleguen.
  let enCurso: Promise<string | null> | null = null;

  async function renovarUnaVez(anterior: Sesion): Promise<string | null> {
    try {
      const nueva = await renovar();
      // Si mientras tanto alguien salió (o entró otra persona), esta respuesta ya no es de nadie.
      if (leerSesion() !== anterior) return leerSesion()?.tokenPowerSync ?? null;
      guardarSesion(nueva);
      return nueva.tokenPowerSync;
    } catch (error) {
      if (error instanceof ErrorApi && error.status === 401) return null;
      throw error;
    }
  }

  return function tokenPowerSyncVigente(): Promise<string | null> {
    const sesion = leerSesion();
    if (!sesion) return Promise.resolve(null);

    const vence = venceEn(sesion.tokenPowerSync);
    // Un `exp` que no se lee cuenta como vencido: renovar cuesta una petición, presentarse con
    // un token inservible cuesta quedarse sin bajar datos.
    if (vence !== null && vence - ahora() > MARGEN_MS) return Promise.resolve(sesion.tokenPowerSync);

    enCurso ??= renovarUnaVez(sesion).finally(() => {
      enCurso = null;
    });
    return enCurso;
  };
}
