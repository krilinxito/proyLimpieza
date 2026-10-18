import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { conectarSesion } from '../../lib/api';
import { ahoraOficialMs } from '../../lib/reloj';
import {
  abrirBaseLocal as abrirBaseLocalDelNavegador,
  ContextoBaseLocal,
  type BaseLocal,
  type ControlBaseLocal,
} from '../../lib/powersync';
import { borrarAtencion, guardarAtencion, leerAtencion } from '../atencion/api/almacen';
import { borrarSesion, guardarSesion, leerSesion } from './api/almacen';
import { login } from './api/login';
import { ContextoSesion, type ValorSesion } from './contexto';
import { crearRenovador } from './renovacion';
import type { Sesion } from './types';

type Props = {
  children: ReactNode;
  /**
   * Cómo abrir la base local. Por defecto, la del navegador. Los tests pasan un doble
   * (`test/baseLocalDePrueba.ts`), porque el SDK web no corre en jsdom.
   */
  abrirBaseLocal?: () => Promise<ControlBaseLocal>;
};

/** La sucursal guardada en la tablet, si quien está adentro es un ADMIN que eligió una. */
function atencionGuardada(sesion: Sesion | null): string | null {
  return sesion?.usuario.rol === 'ADMIN' ? leerAtencion(sesion.usuario.id) : null;
}

/**
 * Dueño de la sesión mientras la app está abierta, y de la base local que va con ella.
 *
 * Al montar lee la sesión del dispositivo, sin llamar a la API: por eso una recarga no pide
 * la contraseña, aunque no haya internet. Le presta el token a `lib/api`. Y mientras hay
 * alguien adentro, mantiene abierta la base local y la sincronización (SPEC-KRILINXI-004):
 * se abre al entrar y se borra al salir o cuando el servidor rechaza la sesión. Cuando el
 * token de PowerSync está por vencer, lo renueva sin pedir la contraseña (SPEC-KRILINXI-010).
 *
 * También sabe dónde atiende el ADMIN (SPEC-KRILINXI-029), porque es quien conecta PowerSync y
 * esa sucursal viaja en la conexión: cambiarla reconecta con el parámetro nuevo, sin cerrar ni
 * borrar la base.
 */
export function SesionProvider({ children, abrirBaseLocal = abrirBaseLocalDelNavegador }: Props) {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion);
  const [base, setBase] = useState<BaseLocal | null>(null);
  // La base ya abierta, para conectarla (y reconectarla cuando cambia dónde atiende el ADMIN).
  const [abierta, setAbierta] = useState<ControlBaseLocal | null>(null);
  const [atencion, setAtencion] = useState<string | null>(() => atencionGuardada(sesion));

  // El cliente de la API y el conector de PowerSync piden el token fuera de React, cada vez
  // que lo necesitan. Una ref les da siempre el valor actual sin tener que reconectarlos.
  const actual = useRef(sesion);
  // La base abierta (o abriéndose), para poder borrarla al salir.
  const control = useRef<Promise<ControlBaseLocal> | null>(null);

  const cambiarSesion = useCallback((nueva: Sesion | null, motivo: 'salir' | 'rechazada' = 'salir') => {
    actual.current = nueva;
    if (nueva) {
      guardarSesion(nueva);
    } else {
      borrarSesion();
      // Salir también deja de atender: quien entre después elige por su cuenta (SPEC-KRILINXI-029).
      borrarAtencion();
      setAtencion(null);
      const anterior = control.current;
      control.current = null;
      setBase(null);
      setAbierta(null);
      anterior
        ?.then(async (c) => {
          // Si el servidor rechazó la sesión con trabajo sin subir (un token que venció
          // mientras no había internet), borrar sería perder ropa que entró de verdad
          // (CLAUDE.md §13). Se desconecta y nada más: al volver a ingresar, la misma base
          // se abre de nuevo y la subida sigue — SPEC-KRILINXI-007.
          if (motivo === 'rechazada' && (await c.hayCambiosSinSubir())) {
            await c.desconectar();
            return;
          }
          // Salir borra los datos del dispositivo (CLAUDE.md §6): quien entre después en esta
          // tablet no tiene por qué ver las órdenes del anterior.
          await c.desconectarYBorrar();
        })
        .catch((error: unknown) => console.error('No se pudo cerrar la base local.', error));
    }
    setSesion(nueva);
  }, []);

  // Uno solo mientras la app esté abierta: así varias conexiones seguidas comparten la misma
  // renovación. Guardar el par nuevo pasa por `cambiarSesion`, como el login; como sigue
  // habiendo alguien, la base local no se cierra ni se reabre.
  const tokenPowerSyncVigente = useMemo(
    () =>
      crearRenovador({
        leerSesion: () => actual.current,
        guardarSesion: (nueva) => cambiarSesion(nueva),
        // El `exp` del token está en la hora del servidor: se compara con la hora corregida, o
        // una tablet atrasada creería vigente un token ya vencido (SPEC-KRILINXI-012).
        ahora: ahoraOficialMs,
      }),
    [cambiarSesion],
  );

  useEffect(
    () =>
      conectarSesion({
        obtenerToken: () => actual.current?.token ?? null,
        alRechazarSesion: () => cambiarSesion(null, 'rechazada'),
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
        setAbierta(c);
      })
      .catch((error: unknown) => console.error('No se pudo abrir la base local.', error));

    return () => {
      vigente = false;
    };
  }, [hayAlguien, abrirBaseLocal]);

  // Conecta la base apenas está abierta, y vuelve a conectar cuando el ADMIN empieza o deja de
  // atender: con la sucursal, PowerSync le baja la ropa de ahí (`atencion_admin`, CLAUDE.md §7);
  // sin ella, deja de bajarla. Reconectar no toca la cola: lo que no subió sigue subiendo.
  useEffect(() => {
    if (!abierta) return;
    // Sin `await`, a propósito: la base ya responde con lo guardado. La sincronización
    // va por detrás y sin internet simplemente espera (CLAUDE.md §6).
    abierta
      .conectar(tokenPowerSyncVigente, atencion ? { sucursal_id: atencion } : undefined)
      .catch((error: unknown) => console.error('No se pudo conectar la sincronización.', error));
  }, [abierta, atencion, tokenPowerSyncVigente]);

  const esAdmin = sesion?.usuario.rol === 'ADMIN';
  const usuarioId = sesion?.usuario.id;

  const atender = useCallback(
    (sucursalId: string | null) => {
      // Un EMPLEADO trabaja siempre en la suya (CLAUDE.md §3): no hay nada que elegir.
      if (!esAdmin || !usuarioId) return;
      if (sucursalId) guardarAtencion(usuarioId, sucursalId);
      else borrarAtencion();
      setAtencion(sucursalId);
    },
    [esAdmin, usuarioId],
  );

  const valor = useMemo<ValorSesion>(
    () => ({
      sesion,
      ingresar: async (username, password) => cambiarSesion(await login(username, password)),
      salir: () => cambiarSesion(null),
      atencion,
      atender,
    }),
    [sesion, cambiarSesion, atencion, atender],
  );

  return (
    <ContextoSesion value={valor}>
      <ContextoBaseLocal value={base}>{children}</ContextoBaseLocal>
    </ContextoSesion>
  );
}
