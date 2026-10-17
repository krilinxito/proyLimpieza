import { useEffect, useState } from 'react';

/**
 * Si el navegador tiene red, al día — SPEC-KRILINXI-017. Para las pantallas del admin que
 * escriben directo a la API: sin red, sus botones se deshabilitan y lo dicen en vez de fallar
 * al tocarlos (CLAUDE.md §9).
 *
 * Es una pista, no una garantía: `online` es "hay red", no "el servidor contesta". Por eso quien
 * escribe igual trata el `sin-conexion` de `enviar` (`lib/api`).
 */
export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const conectado = () => setEnLinea(true);
    const desconectado = () => setEnLinea(false);
    window.addEventListener('online', conectado);
    window.addEventListener('offline', desconectado);
    return () => {
      window.removeEventListener('online', conectado);
      window.removeEventListener('offline', desconectado);
    };
  }, []);

  return enLinea;
}
