import { esRol, type Rol } from '../../lib/dominio';

/** Quien está usando la tablet. Es lo que devuelve la API en `usuario`, sin nada más. */
export type Usuario = {
  id: string;
  nombreCompleto: string;
  username: string;
  rol: Rol;
  /** null para el ADMIN, que no está atado a ninguna sucursal. */
  sucursalId: string | null;
};

/** Las dos credenciales de CLAUDE.md §6 y de quién son. */
export type Sesion = {
  /** El JWT de nuestra API. */
  token: string;
  /** El que verifica PowerSync. Aquí solo se guarda: lo usa `powersync-local`. */
  tokenPowerSync: string;
  usuario: Usuario;
};

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor !== '';
}

export function esUsuario(valor: unknown): valor is Usuario {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'id' in valor &&
    esTexto(valor.id) &&
    'nombreCompleto' in valor &&
    esTexto(valor.nombreCompleto) &&
    'username' in valor &&
    esTexto(valor.username) &&
    'rol' in valor &&
    esRol(valor.rol) &&
    'sucursalId' in valor &&
    (valor.sucursalId === null || esTexto(valor.sucursalId))
  );
}

/**
 * Comprueba la forma de una sesión venga de donde venga: de la respuesta del login o de lo
 * que quedó guardado en el navegador, que pudo escribir una versión vieja de la app.
 */
export function esSesion(valor: unknown): valor is Sesion {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'token' in valor &&
    esTexto(valor.token) &&
    'tokenPowerSync' in valor &&
    esTexto(valor.tokenPowerSync) &&
    'usuario' in valor &&
    esUsuario(valor.usuario)
  );
}
