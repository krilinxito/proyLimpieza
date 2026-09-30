/**
 * Factory de sesiones para los tests — SPEC-KRILINXI-003
 *
 * Arma una sesión válida con valores por defecto; cada test cambia solo lo que le importa:
 *
 *     sesionDePrueba()                        // EMPLEADO de una sucursal
 *     sesionDePrueba({ rol: 'ADMIN' })         // ADMIN, sin sucursal
 *     sesionDePrueba({ nombreCompleto: 'Rosa Quispe' })
 *
 * Los tokens son texto cualquiera: en el frontend nadie los abre, solo se reenvían.
 */
import type { Sesion, Usuario } from '../features/auth/types';

export function sesionDePrueba(cambios: Partial<Usuario> = {}): Sesion {
  const rol = cambios.rol ?? 'EMPLEADO';
  return {
    token: 'token-api-de-prueba',
    tokenPowerSync: 'token-powersync-de-prueba',
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
