/**
 * Dónde vive la sesión en el dispositivo: `localStorage`.
 *
 * Por qué ahí: sobrevive a recargar la página y a cerrar el navegador, que es justo lo que
 * pide CLAUDE.md §6 ("el token vive en el dispositivo"). `sessionStorage` se borra al
 * cerrar la pestaña, y una cookie la mandaría el navegador solo, a cada petición.
 *
 * Es el único archivo que toca el almacenamiento. Todos los accesos van en try/catch: en
 * modo privado o con el almacenamiento lleno, el navegador lanza en vez de guardar, y un
 * error ahí no puede tumbar la pantalla de ingreso.
 */
import { esSesion, type Sesion } from '../types';

const CLAVE = 'lavanderia.sesion';

export function leerSesion(): Sesion | null {
  try {
    const guardada = localStorage.getItem(CLAVE);
    if (guardada === null) return null;
    const datos: unknown = JSON.parse(guardada);
    // Algo que no es una sesión válida (versión vieja, editado a mano) se descarta: mejor
    // pedir la contraseña que arrancar con un rol inventado.
    if (esSesion(datos)) return datos;
    localStorage.removeItem(CLAVE);
    return null;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion: Sesion): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(sesion));
  } catch {
    // Sin almacenamiento, la sesión dura lo que dure la pestaña. Es peor, pero funciona.
  }
}

export function borrarSesion(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar si no hay almacenamiento.
  }
}
