/**
 * Factory de sesiones para los tests — SPEC-KRILINXI-003, ampliada en SPEC-KRILINXI-010
 *
 * Arma una sesión válida con valores por defecto; cada test cambia solo lo que le importa:
 *
 *     sesionDePrueba()                        // EMPLEADO de una sucursal
 *     sesionDePrueba({ rol: 'ADMIN' })         // ADMIN, sin sucursal
 *     sesionDePrueba({ nombreCompleto: 'Rosa Quispe' })
 *
 * El de la API es texto cualquiera: en el frontend nadie lo abre, solo se reenvía. El de
 * PowerSync sí se abre para leer cuándo vence (SPEC-KRILINXI-010), así que es un JWT con un
 * `exp` lejano: con él ninguna pantalla dispara una renovación sin que el test la pida. Para
 * probar la renovación, `jwtDePrueba` arma uno que vence cuando haga falta:
 *
 *     const sesion = { ...sesionDePrueba(), tokenPowerSync: jwtDePrueba(Date.now() + 60_000) };
 */
import type { Sesion, Usuario } from '../features/auth/types';

function base64url(texto: string): string {
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Un JWT con la forma de verdad y un `exp` elegido (en milisegundos, como `Date.now()`). La
 * firma es inventada: el frontend nunca la comprueba, eso lo hace el servidor.
 */
export function jwtDePrueba(vence: number, marca = 'prueba'): string {
  const cabecera = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const contenido = base64url(JSON.stringify({ sub: marca, exp: Math.floor(vence / 1000) }));
  return `${cabecera}.${contenido}.firma-${marca}`;
}

/** Vence en el año 2100: para los tests que no hablan de renovar. */
export const TOKEN_POWERSYNC_DE_PRUEBA = jwtDePrueba(Date.UTC(2100, 0, 1));

export function sesionDePrueba(cambios: Partial<Usuario> = {}): Sesion {
  const rol = cambios.rol ?? 'EMPLEADO';
  return {
    token: 'token-api-de-prueba',
    tokenPowerSync: TOKEN_POWERSYNC_DE_PRUEBA,
    usuario: {
      id: '0b6f1c1e-7c1a-4a5e-9a57-2f8b0a1d3c11',
      nombreCompleto: rol === 'ADMIN' ? 'Ana Administradora' : 'Elena Empleada',
      username: rol === 'ADMIN' ? 'ana' : 'elena',
      rol,
      // Regla del negocio (CLAUDE.md §3): el ADMIN no tiene sucursal, el EMPLEADO siempre.
      sucursalId: rol === 'ADMIN' ? null : '5d2c8a90-3b4e-4f61-8c7d-1e2f3a4b5c6d',
      ...cambios,
    },
  };
}
