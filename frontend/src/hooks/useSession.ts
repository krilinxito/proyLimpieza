import { useContext } from 'react';
import { ContextoSesion, type ValorSesion } from '../features/auth/contexto';

/**
 * Quién está usando la tablet, y cómo entrar o salir.
 *
 * Es la única puerta a la sesión desde una pantalla: ninguna lee el almacenamiento ni llama
 * al login por su cuenta (CLAUDE.md §5).
 */
export function useSession(): ValorSesion {
  const valor = useContext(ContextoSesion);
  if (!valor) {
    // Error de programación, no del usuario: alguien montó una pantalla fuera del provider.
    throw new Error('useSession() necesita estar dentro de <SesionProvider>.');
  }
  return valor;
}
