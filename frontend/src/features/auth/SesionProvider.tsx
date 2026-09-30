import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { conectarSesion } from '../../lib/api';
import { borrarSesion, guardarSesion, leerSesion } from './api/almacen';
import { login } from './api/login';
import { ContextoSesion, type ValorSesion } from './contexto';
import type { Sesion } from './types';

/**
 * Dueño de la sesión mientras la app está abierta.
 *
 * Al montar la lee del dispositivo, sin llamar a la API: por eso una recarga no pide la
 * contraseña, aunque no haya internet. Y le presta el token a `lib/api`, que lo pone en
 * cada petición y avisa aquí si el servidor lo rechaza.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion);

  // El cliente de la API pide el token fuera de React, en cada petición. Una ref le da
  // siempre el valor actual sin tener que volver a conectarlo cada vez que cambia.
  const actual = useRef(sesion);

  const cambiarSesion = useCallback((nueva: Sesion | null) => {
    actual.current = nueva;
    if (nueva) guardarSesion(nueva);
    else borrarSesion();
    setSesion(nueva);
  }, []);

  useEffect(
    () =>
      conectarSesion({
        obtenerToken: () => actual.current?.token ?? null,
        alRechazarSesion: () => cambiarSesion(null),
      }),
    [cambiarSesion],
  );

  const valor = useMemo<ValorSesion>(
    () => ({
      sesion,
      ingresar: async (username, password) => cambiarSesion(await login(username, password)),
      salir: () => cambiarSesion(null),
    }),
    [sesion, cambiarSesion],
  );

  return <ContextoSesion value={valor}>{children}</ContextoSesion>;
}
