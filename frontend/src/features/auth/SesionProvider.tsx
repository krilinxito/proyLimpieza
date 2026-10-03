import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { conectarSesion } from '../../lib/api';
import {
  abrirBaseLocal as abrirBaseLocalDelNavegador,
  ContextoBaseLocal,
  type BaseLocal,
  type ControlBaseLocal,
} from '../../lib/powersync';
import { borrarSesion, guardarSesion, leerSesion } from './api/almacen';
import { login } from './api/login';
import { ContextoSesion, type ValorSesion } from './contexto';
import type { Sesion } from './types';

type Props = {
  children: ReactNode;
  /**
   * Cómo abrir la base local. Por defecto, la del navegador. Los tests pasan un doble
   * (`test/baseLocalDePrueba.ts`), porque el SDK web no corre en jsdom.
   */
  abrirBaseLocal?: () => Promise<ControlBaseLocal>;
};

/**
 * Dueño de la sesión mientras la app está abierta, y de la base local que va con ella.
 *
 * Al montar lee la sesión del dispositivo, sin llamar a la API: por eso una recarga no pide
 * la contraseña, aunque no haya internet. Le presta el token a `lib/api`. Y mientras hay
 * alguien adentro, mantiene abierta la base local y la sincronización (SPEC-KRILINXI-004):
 * se abre al entrar y se borra al salir o cuando el servidor rechaza la sesión.
 */
export function SesionProvider({ children, abrirBaseLocal = abrirBaseLocalDelNavegador }: Props) {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion);
  const [base, setBase] = useState<BaseLocal | null>(null);

  // El cliente de la API y el conector de PowerSync piden el token fuera de React, cada vez
  // que lo necesitan. Una ref les da siempre el valor actual sin tener que reconectarlos.
  const actual = useRef(sesion);
  // La base abierta (o abriéndose), para poder borrarla al salir.
  const control = useRef<Promise<ControlBaseLocal> | null>(null);

  const cambiarSesion = useCallback((nueva: Sesion | null) => {
    actual.current = nueva;
    if (nueva) {
      guardarSesion(nueva);
    } else {
      borrarSesion();
      // Salir borra los datos del dispositivo (CLAUDE.md §6): quien entre después en esta
      // tablet no tiene por qué ver las órdenes del anterior.
      const abierta = control.current;
      control.current = null;
      setBase(null);
      abierta
        ?.then((c) => c.desconectarYBorrar())
        .catch((error: unknown) => console.error('No se pudo borrar la base local al salir.', error));
    }
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

  // Depende de si hay alguien, no de la sesión entera: renovar el token no reabre la base.
  const hayAlguien = sesion !== null;

  useEffect(() => {
    if (!hayAlguien) return;
    // `vigente` descarta una apertura que termina después de salir (o del doble montaje
    // de StrictMode en desarrollo), para no conectar una base que ya nadie usa.
    let vigente = true;
    const abierta = abrirBaseLocal();
    control.current = abierta;

    abierta
      .then((c) => {
        if (!vigente) return;
        setBase(c.base);
        // Sin `await`, a propósito: la base ya responde con lo guardado. La sincronización
        // va por detrás y sin internet simplemente espera (CLAUDE.md §6).
        c.conectar(() => actual.current?.tokenPowerSync ?? null).catch((error: unknown) =>
          console.error('No se pudo conectar la sincronización.', error),
        );
      })
      .catch((error: unknown) => console.error('No se pudo abrir la base local.', error));

    return () => {
      vigente = false;
    };
  }, [hayAlguien, abrirBaseLocal]);

  const valor = useMemo<ValorSesion>(
    () => ({
      sesion,
      ingresar: async (username, password) => cambiarSesion(await login(username, password)),
      salir: () => cambiarSesion(null),
    }),
    [sesion, cambiarSesion],
  );

  return (
    <ContextoSesion value={valor}>
      <ContextoBaseLocal value={base}>{children}</ContextoBaseLocal>
    </ContextoSesion>
  );
}
