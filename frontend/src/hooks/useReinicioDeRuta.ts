import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Lo que el menú pone en el estado de la dirección cuando se toca el destino en el que ya se está (SPEC-KRILINXI-057). */
export const CLAVE_DE_REINICIO = 'reinicio';

/** La marca de reinicio de la dirección actual, o `undefined` si no hay. */
function marcaDe(estado: unknown): number | undefined {
  if (typeof estado !== 'object' || estado === null || !(CLAVE_DE_REINICIO in estado)) return undefined;
  const marca = (estado as Record<string, unknown>)[CLAVE_DE_REINICIO];
  return typeof marca === 'number' ? marca : undefined;
}

/**
 * Avisa cuando se vuelve a tocar, en el menú, la pantalla en la que ya se está — SPEC-KRILINXI-057.
 *
 * Una pantalla con vistas adentro (el Mostrador abre las boletas en la misma página) no cambia de dirección al
 * abrirlas, así que tocar su nombre en el menú "no hacía nada". El menú (`MenuPrincipal`) deja entonces una marca
 * nueva en el estado de la dirección, y esta función llama a `alReiniciar` **una vez por cada toque**: quien la usa
 * vuelve a su vista de inicio. Una marca que ya venía en la dirección al montarse (recargar con el historial del
 * navegador la conserva) no cuenta: solo reacciona a las que llegan después.
 */
export function useReinicioDeRuta(alReiniciar: () => void): void {
  const marca = marcaDe(useLocation().state);
  const visto = useRef(marca);
  // Siempre la última versión, sin volver a ejecutar el efecto cuando cambia la función.
  const reiniciar = useRef(alReiniciar);
  reiniciar.current = alReiniciar;

  useEffect(() => {
    if (marca !== undefined && marca !== visto.current) reiniciar.current();
    visto.current = marca;
  }, [marca]);
}
