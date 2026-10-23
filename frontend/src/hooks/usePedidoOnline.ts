import { useCallback, useEffect, useState } from 'react';
import { ErrorApi, ErrorSinConexion, RespuestaRara } from '../lib/api';

export type EstadoPedido<T> =
  | { tipo: 'cargando' }
  /** Sin internet: quien lo muestra lo dice, y no muestra ningún número (CLAUDE.md §8). */
  | { tipo: 'sin-conexion' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; datos: T };

const ERROR_GENERAL = 'No se pudo traer la información. Prueba de nuevo y, si sigue pasando, avísale al encargado.';

function estadoDeError(error: unknown, mensajeGeneral: string): EstadoPedido<never> {
  if (error instanceof ErrorSinConexion) return { tipo: 'sin-conexion' };
  // El servidor ya escribe sus mensajes para quien está mirando, sin códigos.
  if (error instanceof ErrorApi || error instanceof RespuestaRara) return { tipo: 'error', mensaje: error.message };
  return { tipo: 'error', mensaje: mensajeGeneral };
}

/**
 * Un pedido a la API que necesita conexión — SPEC-KRILINXI-016 (salió de `usePanel`,
 * SPEC-KRILINXI-015, cuando la lista de clientes necesitó lo mismo con su propia paginación).
 * Vive en `hooks/` (lo transversal, CLAUDE.md §5) desde SPEC-KRILINXI-017: la consulta de la
 * auditoría (SPEC-KRILINXI-018) también lee online, y un hook de una feature no se importa
 * desde otra. Es para LEER: las escrituras online del admin (personal, sucursales) no lo usan.
 *
 * `pedir` se vuelve a llamar cada vez que cambia (envuélvela en `useCallback` con lo que la
 * hace distinta: el filtro, la página), cuando el navegador avisa que volvió internet
 * (`online`) y con `recargar`. Si cambia antes de que llegue la respuesta, la vieja se
 * descarta (→ SPEC-KRILINXI-010, "descartar una respuesta que llega tarde").
 */
export function usePedidoOnline<T>(
  pedir: () => Promise<T>,
  /** Lo que se muestra ante un error que no trae su propio mensaje. */
  mensajeGeneral: string = ERROR_GENERAL,
): { estado: EstadoPedido<T>; recargar: () => void } {
  const [estado, setEstado] = useState<EstadoPedido<T>>({ tipo: 'cargando' });
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    let vigente = true;
    setEstado({ tipo: 'cargando' });
    pedir()
      .then((datos) => vigente && setEstado({ tipo: 'listo', datos }))
      .catch((error: unknown) => vigente && setEstado(estadoDeError(error, mensajeGeneral)));
    return () => {
      vigente = false;
    };
  }, [pedir, vuelta, mensajeGeneral]);

  useEffect(() => {
    window.addEventListener('online', recargar);
    return () => window.removeEventListener('online', recargar);
  }, [recargar]);

  return { estado, recargar };
}
